import type { MermaidShape } from './model'

/** One SVG primitive of a shape outline; `line` elements take stroke only (no fill/dash). */
export interface ShapeEl {
  tag: 'rect' | 'ellipse' | 'polygon' | 'path' | 'line'
  attrs: Record<string, string | number>
}

/** Pure geometry for each mermaid shape, sized to the node box (shared by canvas nodes + SVG export). */
export function shapeElements(shape: MermaidShape, w: number, h: number, strokeWidth: number): ShapeEl[] {
  const inset = strokeWidth
  const iw = w - inset * 2
  const ih = h - inset * 2

  switch (shape) {
    case 'rounded':
      return [{ tag: 'rect', attrs: { x: inset, y: inset, width: iw, height: ih, rx: 10 } }]
    case 'stadium':
      return [{ tag: 'rect', attrs: { x: inset, y: inset, width: iw, height: ih, rx: ih / 2 } }]
    case 'circle':
    case 'state-start':
      return [{ tag: 'ellipse', attrs: { cx: w / 2, cy: h / 2, rx: iw / 2, ry: ih / 2 } }]
    case 'doublecircle':
    case 'state-end':
      return [
        { tag: 'ellipse', attrs: { cx: w / 2, cy: h / 2, rx: iw / 2, ry: ih / 2 } },
        { tag: 'ellipse', attrs: { cx: w / 2, cy: h / 2, rx: iw / 2 - 5, ry: ih / 2 - 5 } },
      ]
    case 'diamond':
      return [
        {
          tag: 'polygon',
          attrs: { points: `${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}` },
        },
      ]
    case 'hexagon': {
      const c = Math.min(iw / 4, 24)
      return [
        {
          tag: 'polygon',
          attrs: {
            points: `${inset + c},${inset} ${w - inset - c},${inset} ${w - inset},${h / 2} ${w - inset - c},${h - inset} ${inset + c},${h - inset} ${inset},${h / 2}`,
          },
        },
      ]
    }
    case 'subroutine':
      return [
        { tag: 'rect', attrs: { x: inset, y: inset, width: iw, height: ih } },
        { tag: 'line', attrs: { x1: inset + 8, y1: inset, x2: inset + 8, y2: h - inset } },
        { tag: 'line', attrs: { x1: w - inset - 8, y1: inset, x2: w - inset - 8, y2: h - inset } },
      ]
    case 'cylinder': {
      const ry = Math.min(ih / 5, 12)
      return [
        {
          tag: 'path',
          attrs: {
            d: `M ${inset} ${inset + ry}
                A ${iw / 2} ${ry} 0 0 1 ${w - inset} ${inset + ry}
                L ${w - inset} ${h - inset - ry}
                A ${iw / 2} ${ry} 0 0 1 ${inset} ${h - inset - ry}
                Z
                M ${inset} ${inset + ry}
                A ${iw / 2} ${ry} 0 0 0 ${w - inset} ${inset + ry}`,
          },
        },
      ]
    }
    case 'asymmetric':
      return [
        {
          tag: 'polygon',
          attrs: {
            points: `${inset},${inset} ${w - inset},${inset} ${w - inset},${h - inset} ${inset},${h - inset} ${inset + Math.min(iw / 4, 20)},${h / 2}`,
          },
        },
      ]
    case 'trapezoid': {
      const s = Math.min(iw / 5, 28)
      return [
        {
          tag: 'polygon',
          attrs: {
            points: `${inset + s},${inset} ${w - inset - s},${inset} ${w - inset},${h - inset} ${inset},${h - inset}`,
          },
        },
      ]
    }
    case 'trapezoid-alt': {
      const s = Math.min(iw / 5, 28)
      return [
        {
          tag: 'polygon',
          attrs: {
            points: `${inset},${inset} ${w - inset},${inset} ${w - inset - s},${h - inset} ${inset + s},${h - inset}`,
          },
        },
      ]
    }
    case 'rectangle':
    default:
      return [{ tag: 'rect', attrs: { x: inset, y: inset, width: iw, height: ih, rx: 2 } }]
  }
}
