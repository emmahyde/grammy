import { describe, expect, it } from 'vitest'
import { pinsByNode, targetExists, targetFor, type Annotation } from '../annotations'
import { parseFlowchart } from '../parse'
import { composeDoc, splitDoc } from '../surfaceClient'

const LAYOUT = '%% mc:layout {"nodes":{"A":{"x":0,"y":0}},"autoLayout":true}'
const SOURCE = `flowchart TD
  A[Start] -->|go| B{Choice}
  B --> C[Done]`

describe('splitDoc / composeDoc', () => {
  it('keeps the layout line out of the file text and puts it back unchanged', () => {
    const full = `${SOURCE}\n${LAYOUT}`
    const { text, layout } = splitDoc(full)
    expect(text).toBe(SOURCE)
    expect(layout).toBe(LAYOUT)
    expect(composeDoc(text, layout)).toBe(full)
  })

  it('finds a layout line that is not last, so an agent that appends after it loses nothing', () => {
    const { text, layout } = splitDoc(`flowchart TD\n${LAYOUT}\n  A --> B`)
    expect(text).toBe('flowchart TD\n  A --> B')
    expect(layout).toBe(LAYOUT)
  })

  it('handles text with no layout line', () => {
    expect(splitDoc(SOURCE)).toEqual({ text: SOURCE, layout: null })
    expect(composeDoc(SOURCE, null)).toBe(SOURCE)
  })

  it('ignores trailing whitespace so a trailing newline on disk is not a change', () => {
    expect(splitDoc(`${SOURCE}\n\n`).text).toBe(SOURCE)
    expect(composeDoc(`${SOURCE}\n`, LAYOUT)).toBe(`${SOURCE}\n${LAYOUT}`)
  })
})

describe('annotation targets', () => {
  const doc = parseFlowchart(SOURCE)

  it('describes a node with its label and shape', () => {
    expect(targetFor({ kind: 'node', id: 'B' }, doc)).toEqual({ kind: 'node', id: 'B', label: 'Choice', shape: 'diamond' })
  })

  it('describes an edge by its ends, label and position in the file', () => {
    const edge = doc.edges[0]
    expect(targetFor({ kind: 'edge', id: edge.id }, doc)).toEqual({ kind: 'edge', source: 'A', target: 'B', label: 'go', index: 0 })
  })

  it('returns null for an item that is not in the doc', () => {
    expect(targetFor({ kind: 'node', id: 'ZZ' }, doc)).toBeNull()
    expect(targetFor({ kind: 'edge', id: 'nope' }, doc)).toBeNull()
  })

  it('tells whether a commented item survived an edit', () => {
    const node = targetFor({ kind: 'node', id: 'C' }, doc)!
    const edge = targetFor({ kind: 'edge', id: doc.edges[1].id }, doc)!
    const without = parseFlowchart('flowchart TD\n  A[Start] -->|go| B{Choice}')
    expect(targetExists(node, doc)).toBe(true)
    expect(targetExists(node, without)).toBe(false)
    expect(targetExists(edge, without)).toBe(false)
    expect(targetExists(node, null)).toBe(false)
  })
})

describe('pinsByNode', () => {
  const note = (id: string, nodeId: string): Annotation => ({
    id,
    target: { kind: 'node', id: nodeId, label: '', shape: '' },
    tag: null,
    note: 'x',
  })

  it('numbers comments by list position, one list per node, skipping edge comments', () => {
    const edgeNote: Annotation = { id: 'e', target: { kind: 'edge', source: 'A', target: 'B', label: '', index: 0 }, tag: null, note: 'x' }
    const pins = pinsByNode([note('1', 'B'), edgeNote, note('3', 'A'), note('4', 'B')])
    expect(pins.get('B')).toEqual([1, 4])
    expect(pins.get('A')).toEqual([3])
    expect(pins.size).toBe(2)
  })
})
