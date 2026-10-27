import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useInternalNode, useStore } from '@xyflow/react'
import { TAGS } from '../../surface/protocol'
import { describeTarget, sameTarget, type Annotation, type Tag, type Target } from '../lib/annotations'

interface Props {
  /** The selected canvas item, or null when nothing is selected. */
  target: Target | null
  /** Show the full note box; otherwise only the small "Comment" chip. */
  open: boolean
  onOpen: () => void
  onClose: () => void
  annotations: readonly Annotation[]
  onAdd: (note: string, tag: Tag | null) => void
  onRemove: (id: string) => void
}

const BOX_WIDTH = 264
const GAP = 12

const isSubmit = (e: KeyboardEvent) => e.key === 'Enter' && (e.metaKey || e.ctrlKey)

/**
 * The comment box, anchored on the canvas next to the thing it is about.
 * Sits beside the flow inside the same provider, so it follows pan and zoom
 * but keeps a constant size (it is not scaled with the diagram).
 */
export function InlineNote(p: Props) {
  const t = p.target
  const a = useInternalNode(t == null ? '' : t.kind === 'node' ? t.id : t.source)
  const b = useInternalNode(t?.kind === 'edge' ? t.target : '')
  const tx = useStore((s) => s.transform[0])
  const ty = useStore((s) => s.transform[1])
  const zoom = useStore((s) => s.transform[2])
  const paneWidth = useStore((s) => s.width)

  const [note, setNote] = useState('')
  const [tag, setTag] = useState<Tag | null>(null)
  const area = useRef<HTMLTextAreaElement | null>(null)

  // a new box starts empty for a different item, and takes the cursor when it opens
  const key = t == null ? '' : t.kind === 'node' ? `n:${t.id}` : `e:${t.source}>${t.target}`
  useEffect(() => {
    setNote('')
    setTag(null)
  }, [key])
  useEffect(() => {
    if (p.open) area.current?.focus()
  }, [p.open, key])
  // window-level: focus is often on the canvas or a zoom control, not inside the box
  const { open, onClose } = p
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (t == null || a == null || (t.kind === 'edge' && b == null)) return null

  // anchor rectangle in flow coordinates; an edge anchors at the midpoint of its two ends
  const rect = (n: NonNullable<typeof a>) => ({
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    w: n.measured.width ?? 0,
    h: n.measured.height ?? 0,
  })
  const ra = rect(a)
  const anchor =
    t.kind === 'node' || b == null
      ? ra
      : (() => {
          const rb = rect(b)
          return { x: (ra.x + ra.w / 2 + rb.x + rb.w / 2) / 2, y: (ra.y + ra.h / 2 + rb.y + rb.h / 2) / 2, w: 0, h: 0 }
        })()
  const left = anchor.x * zoom + tx
  const right = (anchor.x + anchor.w) * zoom + tx
  const top = anchor.y * zoom + ty
  const bottom = (anchor.y + anchor.h) * zoom + ty

  const here = p.annotations.map((x, i) => ({ x, n: i + 1 })).filter(({ x }) => sameTarget(x.target, t))
  const canAdd = note.trim() !== ''

  function add() {
    if (!canAdd) return
    p.onAdd(note.trim(), tag)
    setNote('')
    setTag(null)
  }

  if (!p.open) {
    return (
      <button className="note-chip" style={{ left: (left + right) / 2, top: bottom + 8 }} onClick={p.onOpen} title="Comment on this (C)">
        Comment{here.length > 0 ? ` · ${here.length}` : ''}
      </button>
    )
  }

  // prefer the right of the item; flip to the left when it would run off the canvas
  const x = right + GAP + BOX_WIDTH <= paneWidth ? right + GAP : Math.max(8, left - GAP - BOX_WIDTH)

  return (
    <div className="note-box" style={{ left: x, top: Math.max(8, top) }} role="dialog" aria-label="Comment on selection">
      <div className="note-box-head">
        <span className="composer-target">
          <span className="kind">{t.kind}</span> {describeTarget(t)}
        </span>
        <button className="icon-btn" onClick={p.onClose} aria-label="Close comment box" title="Close (Esc)">
          ×
        </button>
      </div>

      {here.length > 0 && (
        <ul className="note-box-list">
          {here.map(({ x: ann, n }) => (
            <li key={ann.id}>
              <span className="note-num">{n}</span>
              {ann.tag != null && <span className={`tag-chip ${ann.tag}`}>{ann.tag}</span>}
              <span className="note-box-text">{ann.note}</span>
              <button className="note-x" onClick={() => p.onRemove(ann.id)} aria-label={`Delete comment ${n}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="tags" role="group" aria-label="Comment kind">
        {TAGS.map((name) => (
          <button key={name} className={`tag ${name} ${tag === name ? 'on' : ''}`} aria-pressed={tag === name} onClick={() => setTag(tag === name ? null : name)}>
            {name}
          </button>
        ))}
      </div>
      <textarea
        ref={area}
        className="collab-text"
        rows={2}
        value={note}
        placeholder="Say what to change here… (⌘↵ to add)"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (isSubmit(e)) {
            e.preventDefault()
            add()
          }
        }}
      />
      <button className="collab-btn" disabled={!canAdd} onClick={add}>
        Add comment
      </button>
    </div>
  )
}
