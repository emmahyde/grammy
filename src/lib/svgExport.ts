import { Position, getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/react'
import type { EdgeCurve, FlowDoc, ShapeNode } from './model'
import { shapeElements } from './shapeGeometry'

// Inlined values of the CSS custom props in src/index.css — a standalone SVG can't resolve var().
const C = {
  bg: '#131320',
  nodeFill: '#24283b',
  nodeStroke: '#565f89',
  nodeText: '#cdd3f5',
  edge: '#565f89',
  labelBg: '#1a1b2b',
  labelBorder: '#2b2d45',
  dim: '#7982a9',
}

// Same container padding the canvas uses for subgraph boxes (App.tsx SUBGRAPH_PAD).
const SUBGRAPH_PAD = { top: 44, side: 20, bottom: 20 }
const CANVAS_PAD = 32

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function att(o: Record<string, string | number | undefined>): string {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${typeof v === 'string' ? esc(v) : v}"`)
    .join(' ')
}

type Side = 't' | 'b' | 'l' | 'r'
const SIDE_POS: Record<Side, Position> = { t: Position.Top, b: Position.Bottom, l: Position.Left, r: Position.Right }

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function nodeBox(n: ShapeNode): Box {
  return {
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? n.width ?? 160,
    h: n.measured?.height ?? n.height ?? 52,
  }
}

function sideAnchor(b: Box, side: Side): { x: number; y: number } {
  switch (side) {
    case 't':
      return { x: b.x + b.w / 2, y: b.y }
    case 'b':
      return { x: b.x + b.w / 2, y: b.y + b.h }
    case 'l':
      return { x: b.x, y: b.y + b.h / 2 }
    case 'r':
      return { x: b.x + b.w, y: b.y + b.h / 2 }
  }
}

/**
 * Serialize a FlowDoc to a standalone SVG that matches the canvas: exact node
 * positions/shapes/styles, the same edge routing (facing sides) and curve paths
 * (xyflow path helpers), and React Flow's closed-arrow markers.
 */
export function docToSvg(doc: FlowDoc, curves: Record<number, EdgeCurve> = {}): string {
  const boxes = new Map(doc.nodes.map((n) => [n.id, nodeBox(n)]))

  const sgFrags: string[] = []
  const sgBoxes: Box[] = []
  for (const sg of doc.subgraphs) {
    const members = sg.nodeIds.map((id) => boxes.get(id)).filter((b): b is Box => b != null)
    if (members.length === 0) continue
    const x = Math.min(...members.map((b) => b.x)) - SUBGRAPH_PAD.side
    const y = Math.min(...members.map((b) => b.y)) - SUBGRAPH_PAD.top
    const w = Math.max(...members.map((b) => b.x + b.w)) + SUBGRAPH_PAD.side - x
    const h = Math.max(...members.map((b) => b.y + b.h)) + SUBGRAPH_PAD.bottom - y
    sgBoxes.push({ x, y, w, h })
    sgFrags.push(
      `<rect ${att({ x, y, width: w, height: h, rx: 10, fill: 'rgb(86 95 137 / 0.08)', stroke: C.nodeStroke, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' })}/>`,
      `<text ${att({ x: x + 12, y: y + 8, 'dominant-baseline': 'hanging', 'font-size': 12, 'font-weight': 650, fill: C.dim })}>${esc(sg.label)}</text>`,
    )
  }

  const markers = new Map<string, string>() // stroke color -> marker id
  const edgeFrags: string[] = []
  doc.edges.forEach((e, i) => {
    const s = boxes.get(e.source)
    const t = boxes.get(e.target)
    if (s == null || t == null) return

    // route via the sides facing each other, unless handles were chosen by hand (same rule as rfEdges)
    let sourceSide: Side
    let targetSide: Side
    if (e.sourceHandle == null && e.targetHandle == null) {
      const dx = t.x + t.w / 2 - (s.x + s.w / 2)
      const dy = t.y + t.h / 2 - (s.y + s.h / 2)
      ;[sourceSide, targetSide] =
        Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? ['b', 't'] : ['t', 'b']) : dx >= 0 ? ['r', 'l'] : ['l', 'r']
    } else {
      sourceSide = (e.sourceHandle as Side | null) ?? 'b'
      targetSide = (e.targetHandle as Side | null) ?? 't'
    }
    const sp = sideAnchor(s, sourceSide)
    const tp = sideAnchor(t, targetSide)

    const curve = curves[i] ?? 'default'
    const [path, labelX, labelY] =
      curve === 'linear'
        ? getStraightPath({ sourceX: sp.x, sourceY: sp.y, targetX: tp.x, targetY: tp.y })
        : curve === 'natural'
          ? getBezierPath({
              sourceX: sp.x,
              sourceY: sp.y,
              sourcePosition: SIDE_POS[sourceSide],
              targetX: tp.x,
              targetY: tp.y,
              targetPosition: SIDE_POS[targetSide],
            })
          : getSmoothStepPath({
              sourceX: sp.x,
              sourceY: sp.y,
              sourcePosition: SIDE_POS[sourceSide],
              targetX: tp.x,
              targetY: tp.y,
              targetPosition: SIDE_POS[targetSide],
              borderRadius: 8,
            })

    const edgeStyle = e.data?.edgeStyle ?? 'solid'
    const stroke = e.data?.styleProps?.stroke ?? C.edge
    const width =
      e.data?.styleProps?.['stroke-width'] != null
        ? parseFloat(e.data.styleProps['stroke-width'])
        : edgeStyle === 'thick'
          ? 3.5
          : 1.8

    let markerRef: string | undefined
    if (e.data?.hasArrowStart === true || e.data?.hasArrowEnd === true) {
      if (!markers.has(stroke)) markers.set(stroke, `mc-arrow-${markers.size}`)
      markerRef = `url(#${markers.get(stroke)!})`
    }

    edgeFrags.push(
      `<path ${att({
        d: path,
        fill: 'none',
        stroke,
        'stroke-width': width,
        'stroke-dasharray': edgeStyle === 'dotted' ? '5 5' : undefined,
        'marker-start': e.data?.hasArrowStart === true ? markerRef : undefined,
        'marker-end': e.data?.hasArrowEnd === true ? markerRef : undefined,
      })}/>`,
    )
    if (e.label != null && e.label !== '') {
      const text = String(e.label)
      const tw = text.length * 7.2 + 14 // approx: no text measurement outside a DOM
      edgeFrags.push(
        `<rect ${att({ x: labelX - tw / 2, y: labelY - 10, width: tw, height: 20, rx: 6, fill: C.labelBg, stroke: C.labelBorder })}/>`,
        `<text ${att({ x: labelX, y: labelY, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 12, fill: C.nodeText })}>${esc(text)}</text>`,
      )
    }
  })

  const nodeFrags = doc.nodes.map((n) => {
    const b = boxes.get(n.id)!
    const fill = n.data.styleProps.fill ?? C.nodeFill
    const stroke = n.data.styleProps.stroke ?? C.nodeStroke
    const color = n.data.styleProps.color ?? C.nodeText
    const sw = n.data.styleProps['stroke-width'] != null ? parseFloat(n.data.styleProps['stroke-width']) : 1.5
    const dashed = n.data.styleProps['stroke-dasharray'] != null
    const shapes = shapeElements(n.data.shape, b.w, b.h, sw)
      .map((el) =>
        el.tag === 'line'
          ? `<${el.tag} ${att({ ...el.attrs, stroke, 'stroke-width': sw })}/>`
          : `<${el.tag} ${att({ ...el.attrs, fill, stroke, 'stroke-width': sw, 'stroke-dasharray': dashed ? '6 4' : undefined })}/>`,
      )
      .join('')
    const label =
      n.data.label === ''
        ? ''
        : `<text ${att({ x: b.w / 2, y: b.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 13, fill: color })}>${esc(n.data.label)}</text>`
    return `<g transform="translate(${b.x},${b.y})">${shapes}${label}</g>`
  })

  const all = [...boxes.values(), ...sgBoxes]
  if (all.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>'
  const minX = Math.min(...all.map((b) => b.x)) - CANVAS_PAD
  const minY = Math.min(...all.map((b) => b.y)) - CANVAS_PAD
  const maxX = Math.max(...all.map((b) => b.x + b.w)) + CANVAS_PAD
  const maxY = Math.max(...all.map((b) => b.y + b.h)) + CANVAS_PAD
  const w = maxX - minX
  const h = maxY - minY

  // Marker markup mirrors React Flow's ArrowClosed (react-flow__arrowhead) so exported arrows match the canvas.
  const defs = [...markers.entries()]
    .map(
      ([color, id]) =>
        `<marker id="${id}" markerWidth="18" markerHeight="18" viewBox="-10 -10 20 20" markerUnits="strokeWidth" orient="auto-start-reverse" refX="0" refY="0"><polyline points="-5,-4 0,0 -5,4 -5,-4" stroke-linecap="round" stroke-linejoin="round" stroke-width="1" fill="${color}" stroke="${color}"/></marker>`,
    )
    .join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}" font-family="system-ui, sans-serif">` +
    `<defs>${defs}</defs>` +
    `<rect ${att({ x: minX, y: minY, width: w, height: h, fill: C.bg })}/>` +
    sgFrags.join('') +
    edgeFrags.join('') +
    nodeFrags.join('') +
    `</svg>`
  )
}
