import {
  SURFACE_BASE,
  SURFACE_HEADER,
  type DocSnapshot,
  type FeedbackPayload,
  type SurfaceStatus,
} from '../../surface/protocol'
import { LAYOUT_COMMENT_PREFIX } from './model'
import { stripLayoutMeta } from './parse'

const trimEnd = (s: string) => s.replace(/\s+$/, '')

/**
 * The editor keeps one string: Mermaid plus a trailing `%% mc:layout` line.
 * On disk they live apart, so the agent's file never changes when a node is dragged.
 */
export function splitDoc(full: string): { text: string; layout: string | null } {
  const prefix = LAYOUT_COMMENT_PREFIX.trim()
  const line = full.split('\n').find((l) => l.trim().startsWith(prefix))
  return { text: trimEnd(stripLayoutMeta(full)), layout: line == null ? null : line.trim() }
}

export function composeDoc(text: string, layout: string | null): string {
  const pure = trimEnd(text)
  return layout == null ? pure : `${pure}\n${layout}`
}

const post = { 'content-type': 'application/json', [SURFACE_HEADER]: '1' }

/** The shared document, or null when no surface server is running (plain `vite preview`, a static host). */
export async function loadDoc(timeoutMs = 1500): Promise<DocSnapshot | null> {
  try {
    const res = await fetch(`${SURFACE_BASE}/doc`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const body: unknown = await res.json()
    return isSnapshot(body) ? body : null
  } catch {
    return null
  }
}

function isSnapshot(v: unknown): v is DocSnapshot {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return typeof s.rev === 'number' && typeof s.text === 'string' && (s.layout === null || typeof s.layout === 'string')
}

export type SaveResult = { ok: true; rev: number } | { ok: false; conflict: DocSnapshot }

/** Writes the human's version. `baseRev` is the revision it was based on; a newer one on disk is a conflict. */
export async function saveDoc(body: { baseRev: number; text: string; layout: string | null }): Promise<SaveResult> {
  const res = await fetch(`${SURFACE_BASE}/doc`, { method: 'PUT', headers: post, body: JSON.stringify(body) })
  if (res.status === 409) {
    const theirs: unknown = await res.json()
    if (isSnapshot(theirs)) return { ok: false, conflict: theirs }
  }
  if (!res.ok) throw new Error(`save failed (${res.status})`)
  const { rev } = (await res.json()) as { rev: number }
  return { ok: true, rev }
}

export async function sendFeedback(payload: FeedbackPayload): Promise<{ seq: number }> {
  const res = await fetch(`${SURFACE_BASE}/feedback`, { method: 'POST', headers: post, body: JSON.stringify(payload) })
  const body = (await res.json()) as { seq?: number; error?: string }
  if (!res.ok || body.seq == null) throw new Error(body.error ?? `send failed (${res.status})`)
  return { seq: body.seq }
}

export interface SurfaceEvents {
  onDoc: (snapshot: DocSnapshot) => void
  onStatus: (status: SurfaceStatus) => void
  onConnection: (connected: boolean) => void
}

/** Live updates. EventSource reconnects by itself; every reconnect replays the current revision. */
export function subscribe(handlers: SurfaceEvents): () => void {
  const source = new EventSource(`${SURFACE_BASE}/events`)
  source.addEventListener('open', () => handlers.onConnection(true))
  source.addEventListener('error', () => handlers.onConnection(false))
  source.addEventListener('doc', (e) => {
    const body: unknown = JSON.parse((e as MessageEvent<string>).data)
    if (isSnapshot(body)) handlers.onDoc(body)
  })
  source.addEventListener('status', (e) => handlers.onStatus(JSON.parse((e as MessageEvent<string>).data) as SurfaceStatus))
  return () => source.close()
}
