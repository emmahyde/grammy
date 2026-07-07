import { describe, expect, it } from 'vitest'
import { detectKind, extractLayoutMeta, parseFlowchart, stripLayoutMeta } from '../parse'
import { metaFromNodes, serializeFlowchart } from '../serialize'

const SAMPLE = `flowchart TD
  subgraph S1[Group]
    C((End))
    D(Round)
  end
  A[Start]
  B{Choice}
  T([Stadium label])
  A -->|go| B
  B -.-> C
  B ==> D
  C <--> T
  A --- T
  classDef red fill:#f00,stroke:#333
  class A red
  style B fill:#00f
  linkStyle 0 stroke:#0f0`

describe('detectKind', () => {
  it('classifies diagram types', () => {
    expect(detectKind('flowchart TD\n A-->B')).toBe('flowchart')
    expect(detectKind('graph LR\n A-->B')).toBe('flowchart')
    expect(detectKind('sequenceDiagram\n A->>B: hi')).toBe('beautiful-other')
    expect(detectKind('gantt\n title x')).toBe('mermaid-other')
    expect(detectKind('%% comment\npie\n "a": 1')).toBe('mermaid-other')
  })
})

describe('layout metadata', () => {
  it('extracts and strips the mc:layout comment', () => {
    const text = 'flowchart TD\n  A --> B\n%% mc:layout {"nodes":{"A":{"x":10,"y":20}}}'
    expect(extractLayoutMeta(text)?.nodes.A).toEqual({ x: 10, y: 20 })
    expect(stripLayoutMeta(text)).not.toContain('mc:layout')
  })
})

describe('parseFlowchart', () => {
  it('maps nodes, shapes, edges, subgraphs, styles', () => {
    const doc = parseFlowchart(SAMPLE)
    const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]))
    expect(byId.A.data.shape).toBe('rectangle')
    expect(byId.B.data.shape).toBe('diamond')
    expect(byId.C.data.shape).toBe('circle')
    expect(byId.D.data.shape).toBe('rounded')
    expect(byId.T.data.shape).toBe('stadium')
    expect(byId.A.data.className).toBe('red')
    expect(byId.A.data.styleProps.fill).toBe('#f00')
    expect(byId.B.data.styleProps.fill).toBe('#00f')
    expect(doc.edges).toHaveLength(5)
    expect(doc.edges[0].label).toBe('go')
    expect(doc.edges[0].data?.styleProps.stroke).toBe('#0f0')
    expect(doc.edges[1].data?.edgeStyle).toBe('dotted')
    expect(doc.edges[2].data?.edgeStyle).toBe('thick')
    expect(doc.edges[3].data?.hasArrowStart).toBe(true)
    expect(doc.edges[3].data?.hasArrowEnd).toBe(true)
    expect(doc.edges[4].data?.hasArrowEnd).toBe(false)
    expect(doc.subgraphs).toEqual([{ id: 'S1', label: 'Group', nodeIds: ['C', 'D'] }])
    expect(doc.direction).toBe('TD')
  })

  it('applies saved positions from metadata', () => {
    const doc = parseFlowchart('flowchart TD\n  A --> B\n%% mc:layout {"nodes":{"A":{"x":10,"y":20}}}')
    const a = doc.nodes.find((n) => n.id === 'A')!
    expect(a.position).toEqual({ x: 10, y: 20 })
  })
})

describe('round-trip', () => {
  it('parse → serialize → parse is stable', () => {
    const doc1 = parseFlowchart(SAMPLE)
    const text2 = serializeFlowchart(doc1, metaFromNodes(doc1.nodes, false))
    const doc2 = parseFlowchart(text2)

    expect(doc2.direction).toBe(doc1.direction)
    expect(doc2.nodes.map((n) => [n.id, n.data.shape, n.data.label])).toEqual(
      doc1.nodes.map((n) => [n.id, n.data.shape, n.data.label]),
    )
    expect(doc2.edges.map((e) => [e.source, e.target, e.label ?? null, e.data?.edgeStyle, e.data?.hasArrowStart, e.data?.hasArrowEnd])).toEqual(
      doc1.edges.map((e) => [e.source, e.target, e.label ?? null, e.data?.edgeStyle, e.data?.hasArrowStart, e.data?.hasArrowEnd]),
    )
    expect(doc2.subgraphs).toEqual(doc1.subgraphs)
    expect(doc2.classDefs).toEqual(doc1.classDefs)
    // positions survive via metadata
    expect(doc2.nodes.map((n) => n.position)).toEqual(doc1.nodes.map((n) => n.position))
    // serializing again yields identical text (full fixpoint)
    const text3 = serializeFlowchart(doc2, metaFromNodes(doc2.nodes, false))
    expect(text3).toBe(text2)
  })
})
