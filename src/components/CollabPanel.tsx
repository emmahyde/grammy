import { useState, type KeyboardEvent, type RefObject } from 'react'
import { TAGS, type Decision, type SurfaceStatus } from '../../surface/protocol'
import { describeTarget, type Annotation, type Tag, type Target } from '../lib/annotations'

interface Props {
  /** A surface server answered at load time. Without one, feedback has nowhere to go. */
  linked: boolean
  /** The live event stream is currently connected. */
  connected: boolean
  file: string | null
  status: SurfaceStatus | null
  lastSent: { seq: number; decision: Decision } | null
  selected: Target | null
  annotations: Annotation[]
  exists: (t: Target) => boolean
  message: string
  onMessage: (text: string) => void
  onAdd: (note: string, tag: Tag | null) => void
  onRemove: (id: string) => void
  onLocate: (t: Target) => void
  onSend: (decision: Decision) => void
  sending: boolean
  error: string | null
  composerRef: RefObject<HTMLTextAreaElement | null>
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
  const [note, setNote] = useState('')
  const [tag, setTag] = useState<Tag | null>(null)

  const listening = p.linked && p.status?.listening === true
  const canSend = p.linked && !p.sending && (p.message.trim() !== '' || p.annotations.length > 0)
  const sent = delivery(p)

  function add() {
    const text = note.trim()
    if (text === '' || p.selected == null) return
    p.onAdd(text, tag)
    setNote('')
    setTag(null)
  }

  return (
    <aside className="collab" aria-label="Collaboration">
      <div className="collab-head">
        <span className="collab-title">Design with the agent</span>
        <span className={`presence ${listening ? 'on' : ''}`} title={p.file ?? undefined}>
          <i /> {!p.linked ? 'Not linked' : !p.connected ? 'Reconnecting…' : listening ? 'Agent listening' : 'Agent not listening'}
        </span>
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

      <div className="collab-label">Comment on selection</div>
      {p.selected == null ? (
        <p className="collab-hint">Select a node or an edge on the canvas to comment on it.</p>
      ) : (
        <div className="composer">
          <div className="composer-target">
            <span className="kind">{p.selected.kind}</span> {describeTarget(p.selected)}
          </div>
          <div className="tags" role="group" aria-label="Comment kind">
            {TAGS.map((t) => (
              <button key={t} className={`tag ${tag === t ? 'on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
          <textarea
            ref={p.composerRef}
            className="collab-text"
            rows={2}
            value={note}
            placeholder="Say what to change here… (⌘↵ to add, C to focus)"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (isSubmit(e)) {
                e.preventDefault()
                add()
              }
            }}
          />
          <button className="collab-btn" disabled={note.trim() === ''} onClick={add}>
            Add comment
          </button>
        </div>
      )}

      <div className="collab-label">
        Comments <span className="count">{p.annotations.length}</span>
      </div>
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
