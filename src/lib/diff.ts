import type { FlowDoc, FlowEdge } from './model'

export interface DocDiff {
  addedNodes: string[]
  changedNodes: string[]
  removedNodes: string[]
  /** Ids of edges in the NEW doc that have no counterpart in the old one. */
  addedEdges: string[]
  removedEdges: number
  /** Nodes, edges, direction or grouping changed: positions need a fresh layout pass. */
  structural: boolean
}

const edgeLabel = (e: FlowEdge) => (typeof e.label === 'string' ? e.label : '')

/** Identity of an edge ignoring its generated id; the n-th identical edge gets its own key. */
function edgeKeys(edges: FlowEdge[]): string[] {
  const seen = new Map<string, number>()
  return edges.map((e) => {
    const d = e.data
    const base = [e.source, e.target, edgeLabel(e), d?.edgeStyle, d?.hasArrowStart, d?.hasArrowEnd].join('\u0000')
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}\u0000${n}`
  })
}

const nodeSignature = (n: FlowDoc['nodes'][number]) =>
  JSON.stringify([n.data.label, n.data.shape, n.data.className ?? null, n.data.styleProps])

const groupSignature = (doc: FlowDoc) => JSON.stringify(doc.subgraphs.map((s) => [s.id, s.label, [...s.nodeIds].sort()]))

/** What changed between two parses of the same diagram. `prev` null counts everything as added. */
export function diffDocs(prev: FlowDoc | null, next: FlowDoc): DocDiff {
  if (prev == null) {
    return {
      addedNodes: next.nodes.map((n) => n.id),
      changedNodes: [],
      removedNodes: [],
      addedEdges: next.edges.map((e) => e.id),
      removedEdges: 0,
      structural: true,
    }
  }

  const before = new Map(prev.nodes.map((n) => [n.id, nodeSignature(n)]))
  const after = new Map(next.nodes.map((n) => [n.id, nodeSignature(n)]))
  const addedNodes = [...after.keys()].filter((id) => !before.has(id))
  const removedNodes = [...before.keys()].filter((id) => !after.has(id))
  const changedNodes = [...after.keys()].filter((id) => before.has(id) && before.get(id) !== after.get(id))

  const oldEdgeKeys = new Set(edgeKeys(prev.edges))
  const nextEdgeKeys = edgeKeys(next.edges)
  const nextKeySet = new Set(nextEdgeKeys)
  const addedEdges = next.edges.filter((_, i) => !oldEdgeKeys.has(nextEdgeKeys[i])).map((e) => e.id)
  const removedEdges = [...oldEdgeKeys].filter((k) => !nextKeySet.has(k)).length

  const structural =
    addedNodes.length > 0 ||
    removedNodes.length > 0 ||
    addedEdges.length > 0 ||
    removedEdges > 0 ||
    prev.direction !== next.direction ||
    groupSignature(prev) !== groupSignature(next)

  return { addedNodes, changedNodes, removedNodes, addedEdges, removedEdges, structural }
}

export function isEmptyDiff(d: DocDiff): boolean {
  return !d.structural && d.changedNodes.length === 0
}
