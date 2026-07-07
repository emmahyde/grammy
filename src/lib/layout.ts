import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk-api'
import type { Direction, FlowDoc, ShapeNode } from './model'

const elk = new ELK()

export type LayoutMode = 'hierarchical' | 'adaptive'

const DIR_TO_ELK: Record<Direction, string> = {
  TD: 'DOWN',
  TB: 'DOWN',
  BT: 'UP',
  LR: 'RIGHT',
  RL: 'LEFT',
}

const DEFAULT_W = 160
const DEFAULT_H = 52

/**
 * Auto-layout the doc's nodes with elk (same engine beautiful-mermaid uses).
 * Returns nodes with fresh positions; edges/subgraphs are untouched.
 * Subgraph members are laid out inside an elk compound node, then
 * flattened back to absolute canvas coordinates.
 */
export async function layoutDoc(doc: FlowDoc, mode: LayoutMode = 'hierarchical'): Promise<ShapeNode[]> {
  const memberOf = new Map<string, string>()
  for (const sg of doc.subgraphs) {
    for (const id of sg.nodeIds) memberOf.set(id, sg.id)
  }

  const toElkNode = (n: ShapeNode): ElkNode => ({
    id: n.id,
    width: n.width ?? DEFAULT_W,
    height: n.height ?? DEFAULT_H,
  })

  const topLevel: ElkNode[] = doc.nodes.filter((n) => !memberOf.has(n.id)).map(toElkNode)
  for (const sg of doc.subgraphs) {
    const members = doc.nodes.filter((n) => memberOf.get(n.id) === sg.id)
    if (members.length === 0) continue
    topLevel.push({
      id: sg.id,
      children: members.map(toElkNode),
      layoutOptions: { 'elk.padding': '[top=36,left=16,bottom=16,right=16]' },
    })
  }

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': mode === 'hierarchical' ? 'layered' : 'org.eclipse.elk.stress',
      'elk.direction': DIR_TO_ELK[doc.direction] ?? 'DOWN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
    },
    children: topLevel,
    edges: doc.edges.map((e, i) => ({
      id: `elk-e${i}`,
      sources: [e.source],
      targets: [e.target],
    })),
  }

  const res = await elk.layout(graph)

  const abs = new Map<string, { x: number; y: number }>()
  const walk = (children: ElkNode[] | undefined, ox: number, oy: number) => {
    for (const c of children ?? []) {
      const x = ox + (c.x ?? 0)
      const y = oy + (c.y ?? 0)
      abs.set(c.id, { x, y })
      walk(c.children, x, y)
    }
  }
  walk(res.children, 0, 0)

  return doc.nodes.map((n) => {
    const p = abs.get(n.id)
    return p != null ? { ...n, position: p } : n
  })
}
