import { useState } from 'react'
import type { EdgeCurve, EdgeStyle, MermaidShape } from '../lib/model'
import { PALETTE_SHAPES, SHAPE_LABELS } from '../lib/model'

export interface NodeSelection {
  kind: 'node'
  id: string
  label: string
  shape: MermaidShape
  w: number
  h: number
}

export interface EdgeSelection {
  kind: 'edge'
  id: string
  label: string
  edgeStyle: EdgeStyle
  hasArrowStart: boolean
  hasArrowEnd: boolean
  curve: EdgeCurve
}

export type Selection = NodeSelection | EdgeSelection

interface Props {
  sel: Selection
  onNodeChange: (patch: Partial<Omit<NodeSelection, 'kind' | 'id'>>) => void
  onEdgeChange: (patch: Partial<Omit<EdgeSelection, 'kind' | 'id'>>) => void
  onDuplicate: () => void
  onDelete: () => void
}

type Arrows = { hasArrowStart: boolean; hasArrowEnd: boolean }
const ARROW_CHOICES: { label: string; glyph: string; v: Arrows }[] = [
  { label: 'No arrows', glyph: '—', v: { hasArrowStart: false, hasArrowEnd: false } },
  { label: 'Arrow end', glyph: '⟶', v: { hasArrowStart: false, hasArrowEnd: true } },
  { label: 'Arrow start', glyph: '⟵', v: { hasArrowStart: true, hasArrowEnd: false } },
  { label: 'Both', glyph: '⟷', v: { hasArrowStart: true, hasArrowEnd: true } },
]

const STROKE_CHOICES: { label: string; glyph: string; edgeStyle: EdgeStyle }[] = [
  { label: 'Solid', glyph: '━', edgeStyle: 'solid' },
  { label: 'Dotted', glyph: '┅', edgeStyle: 'dotted' },
  { label: 'Thick', glyph: '▬', edgeStyle: 'thick' },
]

const CURVE_CHOICES: { label: string; v: EdgeCurve }[] = [
  { label: 'Default', v: 'default' },
  { label: 'Natural', v: 'natural' },
  { label: 'Linear', v: 'linear' },
]

/** Floating toolbar for the current node/edge selection (Mermaid Chart style). */
export function SelectionToolbar({ sel, onNodeChange, onEdgeChange, onDuplicate, onDelete }: Props) {
  const [open, setOpen] = useState<'shape' | 'arrow' | 'stroke' | 'curve' | null>(null)
  const toggle = (k: NonNullable<typeof open>) => setOpen(open === k ? null : k)

  if (sel.kind === 'node') {
    return (
      <div className="sel-toolbar">
        <input
          className="sel-label-input"
          value={sel.label}
          placeholder="label"
          onChange={(e) => onNodeChange({ label: e.target.value })}
        />
        <span className="sep" />
        <span className="dim">W</span>
        <input
          className="sel-num"
          type="number"
          min={40}
          step={10}
          value={sel.w}
          onChange={(e) => onNodeChange({ w: Number(e.target.value) })}
        />
        <span className="dim">H</span>
        <input
          className="sel-num"
          type="number"
          min={28}
          step={4}
          value={sel.h}
          onChange={(e) => onNodeChange({ h: Number(e.target.value) })}
        />
        <span className="sep" />
        <div className="tb-pop-anchor">
          <button className="tb-btn" title="Shape" onClick={() => toggle('shape')}>⬡</button>
          {open === 'shape' && (
            <div className="popover menu-pop">
              {PALETTE_SHAPES.map((s) => (
                <button
                  key={s}
                  className={`menu-item${sel.shape === s ? ' checked' : ''}`}
                  onClick={() => {
                    onNodeChange({ shape: s })
                    setOpen(null)
                  }}
                >
                  {SHAPE_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="tb-btn" title="Duplicate" onClick={onDuplicate}>⧉</button>
        <button className="tb-btn danger" title="Delete" onClick={onDelete}>🗑</button>
      </div>
    )
  }

  return (
    <div className="sel-toolbar">
      <input
        className="sel-label-input"
        value={sel.label}
        placeholder="edge label"
        onChange={(e) => onEdgeChange({ label: e.target.value })}
      />
      <span className="sep" />
      <div className="tb-pop-anchor">
        <button className="tb-btn" title="Arrow" onClick={() => toggle('arrow')}>⇄</button>
        {open === 'arrow' && (
          <div className="popover menu-pop">
            <div className="pop-title">Arrow</div>
            {ARROW_CHOICES.map((c) => (
              <button
                key={c.label}
                className={`menu-item${sel.hasArrowStart === c.v.hasArrowStart && sel.hasArrowEnd === c.v.hasArrowEnd ? ' checked' : ''}`}
                onClick={() => {
                  onEdgeChange(c.v)
                  setOpen(null)
                }}
              >
                <span className="mi-glyph">{c.glyph}</span> {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tb-pop-anchor">
        <button className="tb-btn" title="Stroke" onClick={() => toggle('stroke')}>═</button>
        {open === 'stroke' && (
          <div className="popover menu-pop">
            <div className="pop-title">Stroke</div>
            {STROKE_CHOICES.map((c) => (
              <button
                key={c.label}
                className={`menu-item${sel.edgeStyle === c.edgeStyle ? ' checked' : ''}`}
                onClick={() => {
                  onEdgeChange({ edgeStyle: c.edgeStyle })
                  setOpen(null)
                }}
              >
                <span className="mi-glyph">{c.glyph}</span> {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tb-pop-anchor">
        <button className="tb-btn" title="Edge curve" onClick={() => toggle('curve')}>⌒</button>
        {open === 'curve' && (
          <div className="popover menu-pop">
            <div className="pop-title">Edge Curve</div>
            {CURVE_CHOICES.map((c) => (
              <button
                key={c.v}
                className={`menu-item${sel.curve === c.v ? ' checked' : ''}`}
                onClick={() => {
                  onEdgeChange({ curve: c.v })
                  setOpen(null)
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="tb-btn danger" title="Delete" onClick={onDelete}>🗑</button>
    </div>
  )
}
