import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, {
  Decoration,
  EditorView,
  RangeSetBuilder,
  StateEffect,
  StateField,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@uiw/react-codemirror'
import type { Target } from '../lib/annotations'
import { referencesIn, tokenizeLine, type CodeRange, type TokenKind } from '../lib/mermaidCode'

interface Props {
  value: string
  onChange: (text: string) => void
  parseError: string | null
  /** The selected canvas item; the text it is written as is highlighted. */
  target: Target | null
}

const TOKEN_MARK: Record<TokenKind, Decoration> = {
  keyword: Decoration.mark({ class: 'tok-kw' }),
  id: Decoration.mark({ class: 'tok-id' }),
  arrow: Decoration.mark({ class: 'tok-arrow' }),
  label: Decoration.mark({ class: 'tok-label' }),
  comment: Decoration.mark({ class: 'tok-comment' }),
  punct: Decoration.mark({ class: 'tok-punct' }),
}

function highlightViewport(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  let done = -1
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      // adjacent visible ranges can share a line; the builder needs strictly ascending input
      if (line.from > done) {
        for (const t of tokenizeLine(line.text, line.from)) builder.add(t.from, t.to, TOKEN_MARK[t.kind])
        done = line.to
      }
      pos = line.to + 1
    }
  }
  return builder.finish()
}

const syntax = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = highlightViewport(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = highlightViewport(u.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

const setRefs = StateEffect.define<readonly CodeRange[]>()
const REF_MARK = Decoration.mark({ class: 'cm-ref' })

const refs = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setRefs)) continue
      const length = tr.state.doc.length
      next = Decoration.set(
        e.value.filter((r) => r.from < r.to && r.to <= length).map((r) => REF_MARK.range(r.from, r.to)),
        true,
      )
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

const EXTENSIONS = [syntax, refs]

const targetKey = (t: Target | null) => (t == null ? '' : t.kind === 'node' ? `n:${t.id}` : `e:${t.source}>${t.target}`)

export function CodePane({ value, onChange, parseError, target }: Props) {
  const [view, setView] = useState<EditorView | null>(null)
  const scrolledFor = useRef('')
  const key = targetKey(target)
  const ranges = useMemo(() => (target == null ? [] : referencesIn(value, target)), [value, target])

  useEffect(() => {
    if (view == null) return
    const mark = setRefs.of(ranges)
    // scroll only when the selection changes; while typing, the view must stay where the cursor is
    const scroll = key !== scrolledFor.current && ranges.length > 0
    scrolledFor.current = key
    view.dispatch({ effects: scroll ? [mark, EditorView.scrollIntoView(ranges[0].from, { y: 'nearest', yMargin: 24 })] : mark })
  }, [view, ranges, key])

  return (
    <div className="code-pane">
      <CodeMirror
        value={value}
        onChange={onChange}
        onCreateEditor={setView}
        extensions={EXTENSIONS}
        theme="dark"
        height="100%"
        style={{ height: '100%' }}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
      />
      {parseError != null && <div className="parse-error">⚠ {parseError}</div>}
    </div>
  )
}
