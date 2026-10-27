import { describe, expect, it } from 'vitest'
import { extractLayoutMeta, parseFlowchart } from '../parse'
import { lacksPositions, layoutMetaFor, withLayoutMeta } from '../serialize'

const SOURCE = `flowchart TD
  A[Start] --> B[Done]`

describe('withLayoutMeta', () => {
  it('replaces the old layout line and leaves every other byte of the text alone', () => {
    const agentText = `flowchart TD\n  %% keep this comment\n  A[Start] -->|go| B[Done]\n%% mc:layout {"nodes":{}}`
    const meta = { nodes: { A: { x: 1, y: 2 } }, autoLayout: true }
    const out = withLayoutMeta(agentText, meta)
    expect(out.split('\n').slice(0, 3).join('\n')).toBe('flowchart TD\n  %% keep this comment\n  A[Start] -->|go| B[Done]')
    expect(out.match(/%% mc:layout/g)).toHaveLength(1)
    expect(extractLayoutMeta(out)).toEqual(meta)
  })

  it('adds the line when the text has none', () => {
    const out = withLayoutMeta(`${SOURCE}\n\n`, { nodes: {} })
    expect(out).toBe(`${SOURCE}\n%% mc:layout {"nodes":{}}`)
  })
})

describe('lacksPositions', () => {
  const doc = parseFlowchart(SOURCE)

  it('is true with no layout and when a node is missing from it', () => {
    expect(lacksPositions(doc, null)).toBe(true)
    expect(lacksPositions(doc, { nodes: { A: { x: 0, y: 0 } } })).toBe(true)
  })

  it('is false once every node has a position, and for an empty diagram', () => {
    expect(lacksPositions(doc, { nodes: { A: { x: 0, y: 0 }, B: { x: 0, y: 90 } } })).toBe(false)
    expect(lacksPositions(parseFlowchart('flowchart TD'), null)).toBe(false)
  })
})

describe('layoutMetaFor', () => {
  it('carries a saved size forward, because a parse resets every node to the default size', () => {
    const doc = parseFlowchart(SOURCE)
    const previous = { nodes: { A: { x: 0, y: 0, w: 240, h: 80 } } }
    const meta = layoutMetaFor(doc, true, {}, previous)
    expect(meta.nodes.A).toMatchObject({ w: 240, h: 80 })
    expect(meta.nodes.B.w).toBeUndefined()
  })

  it('prefers the live size over the saved one, and omits default sizes', () => {
    const doc = parseFlowchart(SOURCE)
    doc.nodes[0].width = 200
    const meta = layoutMetaFor(doc, false, { 0: 'linear' }, { nodes: { A: { x: 0, y: 0, w: 240 } } })
    expect(meta.nodes.A.w).toBe(200)
    expect(meta.nodes.A.h).toBeUndefined()
    expect(meta.autoLayout).toBe(false)
    expect(meta.curves).toEqual({ 0: 'linear' })
  })
})
