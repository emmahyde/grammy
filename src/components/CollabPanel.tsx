import type { KeyboardEvent } from 'react'
import { type Decision, type SurfaceStatus } from '../../surface/protocol'
import { describeTarget, type Annotation, type Target } from '../lib/annotations'

interface Props {
  /** A surface server answered at load time. Without one, feedback has nowhere to go. */
  linked: boolean
  /** The live event stream is currently connected. */
  connected: boolean
  file: string | null
  /** Expanded panel versus the slim rail. */
  open: boolean
  onToggle: () => void
  status: SurfaceStatus | null
  lastSent: { seq: number; decision: Decision } | null
  annotations: Annotation[]
  exists: (t: Target) => boolean
  message: string
  onMessage: (text: string) => void
  onRemove: (id: string) => void
  onLocate: (t: Target) => void
  onSend: (decision: Decision) => void
  sending: boolean
  error: string | null
}

const isSubmit = (e: KeyboardEvent) => e.key === 'Enter' && (e.metaKey || e.ctrlKey)

function delivery(p: Props): { tone: string; text: string } | null {
  const sent = p.lastSent
  if (sent == null) return null
  const what = sent.decision === 'approve' ? 'Approval' : 'Feedback'
  if (p.status?.pending.includes(sent.seq)) return { tone: 'wait', text: `${what} #${sent.seq} sent. Waiting for the agent to pick it up.` }
  if (p.status?.delivered.includes(sent.seq)) return { tone: 'ok', text: `The agent received ${what.toLowerCase()} #${sent.seq}.` }
  return null
}

export function CollabPanel(p: Props) {
  const listening = p.linked && p.status?.listening === true
  const canSend = p.linked && !p.sending && (p.message.trim() !== '' || p.annotations.length > 0)
  const sent = delivery(p)
  const presenceText = !p.linked ? 'Not linked' : !p.connected ? 'Reconnecting…' : listening ? 'Agent listening' : 'Agent not listening'

  if (!p.open) {
    // the rail keeps the two facts worth a glance (is the agent there, how many comments are staged) and nothing else
    return (
      <aside className="collab collapsed" aria-label="Collaboration">
        <button
          className="rail-btn"
          onClick={p.onToggle}
          aria-expanded={false}
          aria-label={`Open collaboration panel. ${presenceText}. ${p.annotations.length} comments.`}
          title={`${presenceText}. Click to open`}
        >
          <span aria-hidden>‹</span>
          <span className={`presence ${listening ? 'on' : ''}`}>
            <i />
          </span>
          {p.annotations.length > 0 && <span className="rail-count">{p.annotations.length}</span>}
          <span className="rail-label" aria-hidden>
            Agent
          </span>
        </button>
      </aside>
    )
  }

  return (
    <aside className="collab" aria-label="Collaboration">
      <div className="collab-head">
        <span className="collab-title">Design with the agent</span>
        <span className={`presence ${listening ? 'on' : ''}`} title={p.file ?? undefined}>
          <i /> {presenceText}
        </span>
        <button className="icon-btn" onClick={p.onToggle} aria-expanded aria-label="Collapse collaboration panel" title="Collapse">
          ›
        </button>
      </div>

      {!p.linked && (
        <p className="collab-hint">
          No surface server. Start the app with <code>npm run dev</code> so the agent can see this diagram and your comments.
        </p>
      )}
      {p.linked && !listening && p.connected && (
        <p className="collab-hint">
          Nobody is waiting for feedback. Ask the agent to run <code>npm run wait</code>; what you send still queues.
        </p>
      )}

      <label className="collab-label" htmlFor="collab-message">
        Overall note
      </label>
      <textarea
        id="collab-message"
        className="collab-text"
        rows={3}
        value={p.message}
        placeholder="What are we designing? What should change?"
        onChange={(e) => p.onMessage(e.target.value)}
        onKeyDown={(e) => {
          if (isSubmit(e) && canSend) {
            e.preventDefault()
            p.onSend('revise')
          }
        }}
      />

      <div className="collab-label">
        Comments <span className="count">{p.annotations.length}</span>
      </div>
      {p.annotations.length === 0 && <p className="collab-hint">Select a node or edge on the canvas, then press C to comment on it right there.</p>}
      <ol className="notes">
        {p.annotations.map((a, i) => (
          <li key={a.id} className={p.exists(a.target) ? '' : 'gone'}>
            <div className="note-head">
              <span className="note-num">{i + 1}</span>
              <button className="note-target" onClick={() => p.onLocate(a.target)} title="Show on canvas">
                {describeTarget(a.target)}
              </button>
              {a.tag != null && <span className={`tag-chip ${a.tag}`}>{a.tag}</span>}
              {!p.exists(a.target) && <span className="tag-chip">gone</span>}
              <button className="note-x" onClick={() => p.onRemove(a.id)} aria-label={`Delete comment ${i + 1}`}>
                ×
              </button>
            </div>
            <div className="note-body">{a.note}</div>
          </li>
        ))}
      </ol>

      <div className="collab-foot">
        {p.error != null && <div className="collab-error">{p.error}</div>}
        {sent != null && <div className={`delivery ${sent.tone}`}>{sent.text}</div>}
        <div className="collab-actions">
          <button className="collab-btn approve" disabled={!p.linked || p.sending} onClick={() => p.onSend('approve')}>
            Approve
          </button>
          <button className="collab-btn primary" disabled={!canSend} onClick={() => p.onSend('revise')}>
            {p.sending ? 'Sending…' : 'Send to agent'}
          </button>
        </div>
      </div>
    </aside>
  )
}
