import { useEffect, useRef, useState } from 'react'
import { renderMermaidSVG } from 'beautiful-mermaid'
import { detectKind, stripLayoutMeta } from '../lib/parse'

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
function loadMermaid() {
  mermaidReady ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })
    return m.default
  })
  return mermaidReady
}

let renderSeq = 0

/**
 * Renders the document read-only: beautiful-mermaid for its 6 supported
 * types, mermaid-js (lazy-loaded) for everything else.
 */
export function Preview({ text }: { text: string }) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const clean = stripLayoutMeta(text)
    const kind = detectKind(clean)
    const seq = ++renderSeq
    if (kind === 'mermaid-other') {
      loadMermaid()
        .then((mermaid) => mermaid.render(`mc-preview-${seq}`, clean))
        .then(({ svg }) => {
          if (seq === renderSeq) {
            setSvg(svg)
            setError(null)
          }
        })
        .catch((e: unknown) => {
          if (seq === renderSeq) setError(e instanceof Error ? e.message : String(e))
        })
    } else {
      try {
        setSvg(
          renderMermaidSVG(clean, {
            bg: '#131320',
            fg: '#cdd3f5',
            line: '#565f89',
            accent: '#7aa2f7',
          }),
        )
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }, [text])

  return (
    <div className="preview-pane" ref={ref}>
      {error != null ? (
        <div className="preview-error">{error}</div>
      ) : (
        <div className="preview-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  )
}
