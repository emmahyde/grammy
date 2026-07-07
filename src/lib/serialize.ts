import type { FlowDoc, FlowEdge, LayoutMeta, ShapeNode } from './model'
import { LAYOUT_COMMENT_PREFIX, SHAPE_BRACKETS } from './model'

function nodeDecl(n: ShapeNode): string {
  const [open, close] = SHAPE_BRACKETS[n.data.shape]
  const label = n.data.label
  // quote labels containing bracket-ish chars so the parser round-trips them
  const safe = /[[\]{}()|"]/.test(label) ? `"${label.replace(/"/g, '#quot;')}"` : label
  if (n.data.shape === 'rectangle' && label === n.id) return n.id
  return `${n.id}${open}${safe}${close}`
}

function edgeArrow(e: FlowEdge): string {
  const d = e.data!
  const { edgeStyle, hasArrowStart, hasArrowEnd } = d
  if (edgeStyle === 'dotted') {
    if (hasArrowStart && hasArrowEnd) return '<-.->'
    if (hasArrowEnd) return '-.->'
    if (hasArrowStart) return '<-.-'
    return '-.-'
  }
  if (edgeStyle === 'thick') {
    if (hasArrowStart && hasArrowEnd) return '<==>'
    if (hasArrowEnd) return '==>'
    if (hasArrowStart) return '<=='
    return '==='
  }
  if (hasArrowStart && hasArrowEnd) return '<-->'
  if (hasArrowEnd) return '-->'
  if (hasArrowStart) return '<--'
  return '---'
}

function styleRecord(props: Record<string, string>): string {
  return Object.entries(props)
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
}

/**
 * Regenerate flowchart mermaid text from canvas state.
 * Declaration order: subgraph members inside their blocks (the parser only
 * attributes membership to nodes declared inside), then loose nodes, then edges.
 * Layout metadata is appended as a single `%% mc:layout` comment line.
 */
export function serializeFlowchart(doc: FlowDoc, meta?: LayoutMeta): string {
  const lines: string[] = [`flowchart ${doc.direction}`]

  const inSubgraph = new Set<string>()
  for (const sg of doc.subgraphs) for (const id of sg.nodeIds) inSubgraph.add(id)
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))

  for (const sg of doc.subgraphs) {
    lines.push(`  subgraph ${sg.id}[${sg.label}]`)
    for (const id of sg.nodeIds) {
      const n = byId.get(id)
      if (n != null) lines.push(`    ${nodeDecl(n)}`)
    }
    lines.push('  end')
  }

  for (const n of doc.nodes) {
    if (!inSubgraph.has(n.id)) lines.push(`  ${nodeDecl(n)}`)
  }

  for (const e of doc.edges) {
    const arrow = edgeArrow(e)
    const label = typeof e.label === 'string' && e.label.length > 0 ? `|${e.label}|` : ''
    lines.push(`  ${e.source} ${arrow}${label} ${e.target}`)
  }

  for (const [name, props] of Object.entries(doc.classDefs)) {
    lines.push(`  classDef ${name} ${styleRecord(props)}`)
  }
  for (const n of doc.nodes) {
    if (n.data.className != null && doc.classDefs[n.data.className] != null) {
      lines.push(`  class ${n.id} ${n.data.className}`)
    }
  }
  for (const n of doc.nodes) {
    // inline styles not covered by an assigned class
    const own = { ...n.data.styleProps }
    if (n.data.className != null) {
      for (const k of Object.keys(doc.classDefs[n.data.className] ?? {})) {
        if (own[k] === doc.classDefs[n.data.className][k]) delete own[k]
      }
    }
    if (Object.keys(own).length > 0) lines.push(`  style ${n.id} ${styleRecord(own)}`)
  }
  doc.edges.forEach((e, i) => {
    const props = e.data?.styleProps ?? {}
    if (Object.keys(props).length > 0) lines.push(`  linkStyle ${i} ${styleRecord(props)}`)
  })

  if (meta != null) lines.push(LAYOUT_COMMENT_PREFIX + JSON.stringify(meta))
  return lines.join('\n')
}

/** Build layout metadata from current node positions. */
export function metaFromNodes(nodes: ShapeNode[], autoLayout: boolean): LayoutMeta {
  const out: LayoutMeta = { nodes: {}, autoLayout }
  for (const n of nodes) {
    out.nodes[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
  }
  return out
}
