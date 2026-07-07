import { parseMermaid } from 'beautiful-mermaid'
import type {
  Direction,
  EdgeStyle,
  FlowDoc,
  FlowEdge,
  LayoutMeta,
  MermaidShape,
  ShapeNode,
} from './model'
import { LAYOUT_COMMENT_PREFIX } from './model'

export type DiagramKind = 'flowchart' | 'beautiful-other' | 'mermaid-other'

const BEAUTIFUL_TYPES = /^(stateDiagram(-v2)?|sequenceDiagram|classDiagram|erDiagram|xychart(-beta)?)\b/

/** Which pipeline handles this text: WYSIWYG (flowchart), beautiful-mermaid preview, or mermaid-js preview. */
export function detectKind(text: string): DiagramKind {
  const first = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('%%'))
  if (first == null) return 'flowchart'
  if (/^(flowchart|graph)\b/.test(first)) return 'flowchart'
  if (BEAUTIFUL_TYPES.test(first)) return 'beautiful-other'
  return 'mermaid-other'
}

/** Extract the `%% mc:layout {...}` metadata line, if present. */
export function extractLayoutMeta(text: string): LayoutMeta | null {
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t.startsWith(LAYOUT_COMMENT_PREFIX.trim())) {
      const json = t.slice(t.indexOf('{'))
      try {
        return JSON.parse(json) as LayoutMeta
      } catch {
        return null
      }
    }
  }
  return null
}

/** Strip the layout comment before handing text to renderers/parsers. */
export function stripLayoutMeta(text: string): string {
  return text
    .split('\n')
    .filter((l) => !l.trim().startsWith(LAYOUT_COMMENT_PREFIX.trim()))
    .join('\n')
}

const NODE_W = 160
const NODE_H = 52

/**
 * Parse flowchart mermaid text into the canvas document.
 * Positions come from the layout metadata when present; nodes without
 * saved positions get a provisional grid slot (the auto-layout pass replaces it).
 * Throws on parse errors — callers keep the previous good doc.
 */
export function parseFlowchart(text: string): FlowDoc {
  const clean = stripLayoutMeta(text)
  const meta = extractLayoutMeta(text)
  const g = parseMermaid(clean)

  const nodes: ShapeNode[] = []
  let i = 0
  for (const [id, n] of g.nodes) {
    const saved = meta?.nodes[id]
    const styleProps = {
      ...(g.classAssignments.get(id) != null
        ? g.classDefs.get(g.classAssignments.get(id)!)
        : undefined),
      ...g.nodeStyles.get(id),
    }
    nodes.push({
      id,
      type: 'shape',
      position: saved ?? { x: (i % 4) * (NODE_W + 60), y: Math.floor(i / 4) * (NODE_H + 60) },
      width: NODE_W,
      height: NODE_H,
      data: {
        label: n.label,
        shape: n.shape as MermaidShape,
        styleProps,
        className: g.classAssignments.get(id),
      },
    })
    i++
  }

  const edges: FlowEdge[] = g.edges.map((e, idx) => {
    const styleProps = g.linkStyles.get(idx) ?? g.linkStyles.get('default') ?? {}
    return {
      id: `e${idx}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'flow',
      data: {
        edgeStyle: e.style as EdgeStyle,
        hasArrowStart: e.hasArrowStart,
        hasArrowEnd: e.hasArrowEnd,
        styleProps,
      },
    }
  })

  return {
    direction: g.direction as Direction,
    nodes,
    edges,
    subgraphs: g.subgraphs.map((s) => ({ id: s.id, label: s.label, nodeIds: s.nodeIds })),
    classDefs: Object.fromEntries(g.classDefs),
  }
}
