/**
 * Wire types shared by the dev-server surface (Node) and the app (browser).
 * No imports: both tsconfig projects compile this file.
 */

export const SURFACE_BASE = '/__surface'
/** Required on every non-GET request. A cross-site page cannot send it without a CORS preflight. */
export const SURFACE_HEADER = 'x-grammy-surface'

export const TAGS = ['question', 'blocking', 'nit', 'idea'] as const
export type Tag = (typeof TAGS)[number]

export type Target =
  | { kind: 'node'; id: string; label: string; shape: string }
  | { kind: 'edge'; source: string; target: string; label: string; index: number }

export interface FeedbackAnnotation {
  target: Target
  tag: Tag | null
  note: string
}

export type Decision = 'revise' | 'approve'

export interface FeedbackPayload {
  decision: Decision
  /** Overall note: sets the direction for the whole diagram. */
  message: string
  annotations: FeedbackAnnotation[]
}

export type Author = 'human' | 'agent' | 'disk'

/** The shared document. `text` is pure Mermaid; `layout` is the raw `%% mc:layout {...}` line kept beside it. */
export interface DocSnapshot {
  rev: number
  text: string
  layout: string | null
  author: Author
  file: string
}

export interface SurfaceStatus {
  /** Sequence numbers of feedback the agent has not picked up yet. */
  pending: number[]
  /** Sequence numbers the agent has picked up (most recent 20). */
  delivered: number[]
  /** True while an agent runs `npm run wait`. */
  listening: boolean
}
