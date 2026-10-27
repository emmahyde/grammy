import { describe, expect, it } from 'vitest'
import { diffDocs, isEmptyDiff } from '../diff'
import { parseFlowchart } from '../parse'

const BASE = `flowchart TD
  A[Start] --> B{Choice}
  B -->|yes| C[Done]`

const doc = (text: string) => parseFlowchart(text)

describe('diffDocs', () => {
  it('reports nothing for identical text', () => {
    const d = diffDocs(doc(BASE), doc(BASE))
    expect(d.structural).toBe(false)
    expect(isEmptyDiff(d)).toBe(true)
  })

  it('sees an added node and the edge that connects it', () => {
    const d = diffDocs(doc(BASE), doc(`${BASE}\n  C --> D[Archive]`))
    expect(d.addedNodes).toEqual(['D'])
    expect(d.addedEdges).toHaveLength(1)
    expect(d.structural).toBe(true)
  })

  it('treats a label edit as changed but not structural, so positions survive', () => {
    const d = diffDocs(doc(BASE), doc(BASE.replace('Choice', 'Decide')))
    expect(d.changedNodes).toEqual(['B'])
    expect(d.structural).toBe(false)
    expect(isEmptyDiff(d)).toBe(false)
  })

  it('sees a shape change as a node change', () => {
    const d = diffDocs(doc(BASE), doc(BASE.replace('C[Done]', 'C((Done))')))
    expect(d.changedNodes).toEqual(['C'])
  })

  it('counts removed nodes and edges', () => {
    const d = diffDocs(doc(BASE), doc('flowchart TD\n  A[Start] --> B{Choice}'))
    expect(d.removedNodes).toEqual(['C'])
    expect(d.removedEdges).toBe(1)
    expect(d.structural).toBe(true)
  })

  it('treats a changed edge label as one removed and one added edge', () => {
    const d = diffDocs(doc(BASE), doc(BASE.replace('|yes|', '|ok|')))
    expect(d.addedEdges).toHaveLength(1)
    expect(d.removedEdges).toBe(1)
  })

  it('counts a duplicated edge as new rather than matching it to the original', () => {
    const d = diffDocs(doc(BASE), doc(`${BASE}\n  A --> B`))
    expect(d.addedEdges).toHaveLength(1)
    expect(d.removedEdges).toBe(0)
  })

  it('treats a direction change as structural', () => {
    expect(diffDocs(doc(BASE), doc(BASE.replace('TD', 'LR'))).structural).toBe(true)
  })

  it('counts everything as added when there is no previous doc', () => {
    const d = diffDocs(null, doc(BASE))
    expect(d.addedNodes).toEqual(['A', 'B', 'C'])
    expect(d.addedEdges).toHaveLength(2)
  })
})
