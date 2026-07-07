import { useState } from 'react'
import type { Direction, MermaidShape } from '../lib/model'
import { PALETTE_SHAPES, SHAPE_LABELS } from '../lib/model'
import type { LayoutMode } from '../lib/layout'

interface ToolbarProps {
  autoLayout: boolean
  onAutoLayoutChange: (v: boolean) => void
  layoutMode: LayoutMode
  onLayoutModeChange: (m: LayoutMode) => void
  direction: Direction
  onDirectionChange: (d: Direction) => void
  onInsertShape: (shape: MermaidShape) => void
  onInsertText: () => void
  onAddSubgraph: () => void
  onColor: (fill: string) => void
  hasSelection: boolean
}

/** Tiny preview glyph for the shape palette. */
function ShapeGlyph({ shape }: { shape: MermaidShape }) {
  const s = 'var(--fg)'
  const common = { fill: 'none', stroke: s, strokeWidth: 1.5 }
  switch (shape) {
    case 'rounded':
      return <svg width="28" height="20"><rect x="2" y="2" width="24" height="16" rx="5" {...common} /></svg>
    case 'stadium':
      return <svg width="28" height="20"><rect x="2" y="2" width="24" height="16" rx="8" {...common} /></svg>
    case 'circle':
      return <svg width="28" height="20"><circle cx="14" cy="10" r="8" {...common} /></svg>
    case 'doublecircle':
      return <svg width="28" height="20"><circle cx="14" cy="10" r="8" {...common} /><circle cx="14" cy="10" r="5" {...common} /></svg>
    case 'diamond':
      return <svg width="28" height="20"><polygon points="14,1 27,10 14,19 1,10" {...common} /></svg>
    case 'hexagon':
      return <svg width="28" height="20"><polygon points="8,2 20,2 26,10 20,18 8,18 2,10" {...common} /></svg>
    case 'subroutine':
      return <svg width="28" height="20"><rect x="2" y="2" width="24" height="16" {...common} /><line x1="6" y1="2" x2="6" y2="18" stroke={s} strokeWidth="1.5" /><line x1="22" y1="2" x2="22" y2="18" stroke={s} strokeWidth="1.5" /></svg>
    case 'cylinder':
      return <svg width="28" height="20"><path d="M4 5 A10 3 0 0 1 24 5 L24 15 A10 3 0 0 1 4 15 Z M4 5 A10 3 0 0 0 24 5" {...common} /></svg>
    case 'asymmetric':
      return <svg width="28" height="20"><polygon points="2,2 26,2 26,18 2,18 8,10" {...common} /></svg>
    case 'trapezoid':
      return <svg width="28" height="20"><polygon points="8,2 20,2 26,18 2,18" {...common} /></svg>
    case 'trapezoid-alt':
      return <svg width="28" height="20"><polygon points="2,2 26,2 20,18 8,18" {...common} /></svg>
    default:
      return <svg width="28" height="20"><rect x="2" y="2" width="24" height="16" rx="1.5" {...common} /></svg>
  }
}

const DIRECTIONS: { d: Direction; label: string; glyph: string }[] = [
  { d: 'TD', label: 'Top to bottom', glyph: '↓' },
  { d: 'BT', label: 'Bottom to top', glyph: '↑' },
  { d: 'LR', label: 'Left to right', glyph: '→' },
  { d: 'RL', label: 'Right to left', glyph: '←' },
]

export function Toolbar(props: ToolbarProps) {
  const [open, setOpen] = useState<'shapes' | 'direction' | 'layout' | null>(null)
  const toggle = (k: 'shapes' | 'direction' | 'layout') => setOpen(open === k ? null : k)

  return (
    <div className="toolbar">
      <div className="tb-group">
        <label className="tb-btn color-wheel" title={props.hasSelection ? 'Fill color' : 'Fill color (select a node)'}>
          <input
            type="color"
            defaultValue="#2f334d"
            disabled={!props.hasSelection}
            onChange={(e) => props.onColor(e.target.value)}
          />
        </label>
      </div>

      <div className="tb-group">
        <div className="tb-pop-anchor">
          <button className={`tb-btn${open === 'shapes' ? ' active' : ''}`} title="Insert shape" onClick={() => toggle('shapes')}>
            ⬡
          </button>
          {open === 'shapes' && (
            <div className="popover shapes-pop">
              <div className="pop-title">Basic</div>
              <div className="shape-grid">
                {PALETTE_SHAPES.map((s) => (
                  <button
                    key={s}
                    className="shape-cell"
                    title={SHAPE_LABELS[s]}
                    onClick={() => {
                      props.onInsertShape(s)
                      setOpen(null)
                    }}
                  >
                    <ShapeGlyph shape={s} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="tb-btn" title="Insert text" onClick={props.onInsertText}>
          A
        </button>
        <button className="tb-btn" title="Add subgraph around selection" onClick={props.onAddSubgraph}>
          ▣
        </button>
      </div>

      <div className="tb-group">
        <label className="tb-toggle">
          <span>Auto-Layout</span>
          <input
            type="checkbox"
            checked={props.autoLayout}
            onChange={(e) => props.onAutoLayoutChange(e.target.checked)}
          />
          <span className="switch" />
        </label>
        <div className="tb-pop-anchor">
          <button className={`tb-btn${open === 'direction' ? ' active' : ''}`} title="Direction" onClick={() => toggle('direction')}>
            {DIRECTIONS.find((x) => x.d === props.direction)?.glyph ?? '↓'}
          </button>
          {open === 'direction' && (
            <div className="popover menu-pop">
              {DIRECTIONS.map((x) => (
                <button
                  key={x.d}
                  className={`menu-item${props.direction === x.d ? ' checked' : ''}`}
                  onClick={() => {
                    props.onDirectionChange(x.d)
                    setOpen(null)
                  }}
                >
                  <span className="mi-glyph">{x.glyph}</span> {x.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tb-pop-anchor">
          <button className={`tb-btn${open === 'layout' ? ' active' : ''}`} title="Layout algorithm" onClick={() => toggle('layout')}>
            ⑂
          </button>
          {open === 'layout' && (
            <div className="popover menu-pop">
              <div className="pop-title">Layout</div>
              {(['hierarchical', 'adaptive'] as LayoutMode[]).map((m) => (
                <button
                  key={m}
                  className={`menu-item${props.layoutMode === m ? ' checked' : ''}`}
                  onClick={() => {
                    props.onLayoutModeChange(m)
                    setOpen(null)
                  }}
                >
                  {m === 'hierarchical' ? 'Hierarchical' : 'Adaptive'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
