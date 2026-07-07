import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react'
import type { EdgeCurve, FlowEdge as FlowEdgeType } from '../lib/model'

function FlowEdgeInner(props: EdgeProps<FlowEdgeType>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, label, selected, markerStart, markerEnd } = props
  const curve = (data?.curve as EdgeCurve | undefined) ?? 'default'

  const [path, labelX, labelY] =
    curve === 'linear'
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : curve === 'natural'
        ? getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
        : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 })

  const edgeStyle = data?.edgeStyle ?? 'solid'
  const stroke = data?.styleProps?.stroke ?? (selected ? 'var(--edge-selected)' : 'var(--edge)')
  const baseWidth = data?.styleProps?.['stroke-width'] != null ? parseFloat(data.styleProps['stroke-width']) : undefined

  const style: React.CSSProperties = {
    stroke,
    strokeWidth: baseWidth ?? (edgeStyle === 'thick' ? 3.5 : 1.8),
    strokeDasharray: edgeStyle === 'dotted' ? '5 5' : undefined,
  }

  return (
    <>
      <BaseEdge id={props.id} path={path} style={style} markerStart={markerStart} markerEnd={markerEnd} />
      {label != null && label !== '' && (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const FlowEdgeComp = memo(FlowEdgeInner)
