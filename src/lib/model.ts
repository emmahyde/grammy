import type { Node, Edge } from '@xyflow/react'

/** Shapes beautiful-mermaid's parser produces (mermaid flowchart bracket syntax). */
export type MermaidShape =
  | 'rectangle'
  | 'rounded'
  | 'diamond'
  | 'stadium'
  | 'circle'
  | 'subroutine'
  | 'doublecircle'
  | 'hexagon'
  | 'cylinder'
  | 'asymmetric'
  | 'trapezoid'
  | 'trapezoid-alt'
  | 'state-start'
  | 'state-end'

export type EdgeStyle = 'solid' | 'dotted' | 'thick'

export type Direction = 'TD' | 'TB' | 'LR' | 'RL' | 'BT'

export interface ShapeNodeData extends Record<string, unknown> {
  label: string
  shape: MermaidShape
  /** css-ish props from classDef/style lines: fill, stroke, stroke-width, color */
  styleProps: Record<string, string>
  /** classDef name assigned via `class A name` (kept for round-trip) */
  className?: string
}

export interface FlowEdgeData extends Record<string, unknown> {
  edgeStyle: EdgeStyle
  hasArrowStart: boolean
  hasArrowEnd: boolean
  styleProps: Record<string, string>
}

export type ShapeNode = Node<ShapeNodeData>
export type FlowEdge = Edge<FlowEdgeData>

export interface SubgraphInfo {
  id: string
  label: string
  nodeIds: string[]
}

/** Everything the canvas needs; mermaid text is the source of truth. */
export interface FlowDoc {
  direction: Direction
  nodes: ShapeNode[]
  edges: FlowEdge[]
  subgraphs: SubgraphInfo[]
  classDefs: Record<string, Record<string, string>>
}

export type EdgeCurve = 'default' | 'natural' | 'linear'

/** Layout metadata persisted as a `%% mc:layout` comment in the mermaid text. */
export interface LayoutMeta {
  nodes: Record<string, { x: number; y: number; w?: number; h?: number }>
  /** edge curve overrides keyed by edge index (serialize order, same as linkStyle) */
  curves?: Record<number, EdgeCurve>
  autoLayout?: boolean
}

export const LAYOUT_COMMENT_PREFIX = '%% mc:layout '

/** Mermaid bracket syntax for each shape: [open, close]. */
export const SHAPE_BRACKETS: Record<MermaidShape, [string, string]> = {
  rectangle: ['[', ']'],
  rounded: ['(', ')'],
  diamond: ['{', '}'],
  stadium: ['([', '])'],
  circle: ['((', '))'],
  subroutine: ['[[', ']]'],
  doublecircle: ['(((', ')))'],
  hexagon: ['{{', '}}'],
  cylinder: ['[(', ')]'],
  asymmetric: ['>', ']'],
  trapezoid: ['[/', '\\]'],
  'trapezoid-alt': ['[\\', '/]'],
  'state-start': ['[', ']'],
  'state-end': ['[', ']'],
}

export const SHAPE_LABELS: Record<MermaidShape, string> = {
  rectangle: 'Rectangle',
  rounded: 'Rounded',
  diamond: 'Diamond',
  stadium: 'Stadium',
  circle: 'Circle',
  subroutine: 'Subroutine',
  doublecircle: 'Double circle',
  hexagon: 'Hexagon',
  cylinder: 'Cylinder',
  asymmetric: 'Asymmetric',
  trapezoid: 'Trapezoid',
  'trapezoid-alt': 'Trapezoid alt',
  'state-start': 'State start',
  'state-end': 'State end',
}

/** Shapes offered in the insert palette / inspector (state pseudo-shapes excluded). */
export const PALETTE_SHAPES: MermaidShape[] = [
  'rectangle',
  'rounded',
  'stadium',
  'diamond',
  'hexagon',
  'circle',
  'doublecircle',
  'subroutine',
  'cylinder',
  'asymmetric',
  'trapezoid',
  'trapezoid-alt',
]
