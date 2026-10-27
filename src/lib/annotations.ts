import type { FeedbackAnnotation, Tag, Target } from '../../surface/protocol'
import type { FlowDoc } from './model'

export type { Tag, Target }

/** A staged comment. Lives in the browser until the human sends it. */
export interface Annotation {
  id: string
  target: Target
  tag: Tag | null
  note: string
}

/** Which canvas item the human has selected; only the part the target needs. */
export interface SelectedItem {
  kind: 'node' | 'edge'
  id: string
}

/** The comment target for a selected node or edge, or null when the item is not in the doc. */
export function targetFor(sel: SelectedItem, doc: FlowDoc): Target | null {
  if (sel.kind === 'node') {
    const n = doc.nodes.find((x) => x.id === sel.id)
    return n == null ? null : { kind: 'node', id: n.id, label: n.data.label, shape: n.data.shape }
  }
  const index = doc.edges.findIndex((e) => e.id === sel.id)
  if (index < 0) return null
  const e = doc.edges[index]
  return { kind: 'edge', source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : '', index }
}

/** Does the commented item still exist? An agent edit can remove it. Edges match by their two ends. */
export function targetExists(t: Target, doc: FlowDoc | null): boolean {
  if (doc == null) return false
  return t.kind === 'node'
    ? doc.nodes.some((n) => n.id === t.id)
    : doc.edges.some((e) => e.source === t.source && e.target === t.target)
}

export function describeTarget(t: Target): string {
  return t.kind === 'node' ? `${t.id}${t.label !== '' && t.label !== t.id ? ` · ${t.label}` : ''}` : `${t.source} → ${t.target}`
}

/** Node id → the 1-based list positions of the comments on it, for the pins on the canvas. */
export function pinsByNode(annotations: readonly Annotation[]): Map<string, number[]> {
  const pins = new Map<string, number[]>()
  annotations.forEach((a, i) => {
    if (a.target.kind !== 'node') return
    pins.set(a.target.id, [...(pins.get(a.target.id) ?? []), i + 1])
  })
  return pins
}

/** Same canvas item? Edges match by their two ends, as in targetExists. */
export function sameTarget(a: Target, b: Target): boolean {
  return a.kind === 'node' ? b.kind === 'node' && a.id === b.id : b.kind === 'edge' && a.source === b.source && a.target === b.target
}

export function toFeedback(annotations: readonly Annotation[]): FeedbackAnnotation[] {
  return annotations.map(({ target, tag, note }) => ({ target, tag, note }))
}
