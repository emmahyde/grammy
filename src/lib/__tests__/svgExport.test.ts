import { describe, expect, it } from 'vitest'
import { parseFlowchart } from '../parse'
import { docToSvg } from '../svgExport'
import type { FlowDoc } from '../model'

function docWithPositions(text: string): FlowDoc {
  const doc = parseFlowchart(text)
  doc.nodes.forEach((n, i) => {
    n.position = { x: i * 200, y: i * 120 }
    n.width = 160
    n.height = 52
  })
  return doc
}

describe('docToSvg', () => {
  it('places nodes at their exact canvas positions', () => {
    const doc = docWithPositions(`flowchart TD
  A[Start] --> B{Ship it?}
  B -->|yes| C([Deploy])`)
    const svg = docToSvg(doc)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('transform="translate(0,0)"')
    expect(svg).toContain('transform="translate(200,120)"')
    expect(svg).toContain('transform="translate(400,240)"')
    expect(svg).toContain('>Ship it?</text>')
  })

  it('draws edges with arrow markers and label chips', () => {
    const doc = docWithPositions(`flowchart TD
  A[Start] --> B{Ship it?}
  B -->|yes| C([Deploy])`)
    const svg = docToSvg(doc)
    expect(svg.match(/<path /g)?.length).toBe(2)
    expect(svg.match(/marker-end="url\(#mc-arrow-0\)"/g)?.length).toBe(2)
    expect(svg).toContain('<marker id="mc-arrow-0"')
    expect(svg).toContain('>yes</text>')
  })

  it('changes edge paths when a curve override is set', () => {
    const text = `flowchart TD
  A[Start] --> B{Ship it?}`
    const dflt = docToSvg(docWithPositions(text))
    const linear = docToSvg(docWithPositions(text), { 0: 'linear' })
    expect(linear).not.toBe(dflt)
  })

  it('honors style overrides and escapes labels', () => {
    const doc = docWithPositions(`flowchart TD
  A[a & <b>] --> B[Plain]
  style A fill:#ff0000,stroke:#00ff00`)
    const svg = docToSvg(doc)
    expect(svg).toContain('fill="#ff0000"')
    expect(svg).toContain('stroke="#00ff00"')
    expect(svg).toContain('>a &amp; &lt;b&gt;</text>')
  })

  it('renders subgraph containers behind members', () => {
    const doc = docWithPositions(`flowchart TD
  subgraph S1[Group]
    A[Start]
  end
  A --> B[Out]`)
    const svg = docToSvg(doc)
    expect(svg).toContain('stroke-dasharray="6 4"')
    expect(svg).toContain('>Group</text>')
  })
})
