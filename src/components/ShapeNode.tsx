import { createElement, memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MermaidShape, ShapeNode as ShapeNodeType } from '../lib/model'
import { shapeElements } from '../lib/shapeGeometry'

interface ShapeSvgProps {
  shape: MermaidShape
  w: number
  h: number
  fill: string
  stroke: string
  strokeWidth: number
  dashed: boolean
}

/** SVG outline for each mermaid shape, sized to the node box (geometry shared with SVG export). */
function ShapeSvg({ shape, w, h, fill, stroke, strokeWidth, dashed }: ShapeSvgProps) {
  return (
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {shapeElements(shape, w, h, strokeWidth).map((el, i) =>
        el.tag === 'line'
          ? createElement(el.tag, { key: i, ...el.attrs, stroke, strokeWidth })
          : createElement(el.tag, {
              key: i,
              ...el.attrs,
              fill,
              stroke,
              strokeWidth,
              strokeDasharray: dashed ? '6 4' : undefined,
            }),
      )}
    </svg>
  )
}

function ShapeNodeInner({ data, width, height, selected }: NodeProps<ShapeNodeType>) {
  const w = width ?? 160
  const h = height ?? 52
  const fill = data.styleProps.fill ?? 'var(--node-fill)'
  const stroke = data.styleProps.stroke ?? 'var(--node-stroke)'
  const color = data.styleProps.color ?? 'var(--node-text)'
  const strokeWidth = data.styleProps['stroke-width'] != null ? parseFloat(data.styleProps['stroke-width']) : 1.5
  const dashed = data.styleProps['stroke-dasharray'] != null

  const isRound = data.shape === 'circle' || data.shape === 'doublecircle' || data.shape === 'diamond'

  return (
    <div className={`shape-node${selected ? ' selected' : ''}`} style={{ width: w, height: h }}>
      <ShapeSvg shape={data.shape} w={w} h={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth} dashed={dashed} />
      <div className="shape-label" style={{ color, padding: isRound ? '0 18%' : '0 10%' }}>
        {data.label}
      </div>
      {/* all four are type=source: ConnectionMode.Loose lets any end an edge,
          and React Flow only resolves an edge's source end from source-type handles */}
      <Handle type="source" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Right} id="r" />
    </div>
  )
}

export const ShapeNode = memo(ShapeNodeInner)

/** Dashed container drawn behind subgraph members (non-interactive). */
export interface SubgraphNodeData extends Record<string, unknown> {
  label: string
}

function SubgraphNodeInner({ data, width, height }: NodeProps<import('@xyflow/react').Node<SubgraphNodeData>>) {
  return (
    <div className="subgraph-box" style={{ width: width ?? 200, height: height ?? 120 }}>
      <div className="subgraph-title">{data.label}</div>
    </div>
  )
}

export const SubgraphNode = memo(SubgraphNodeInner)
