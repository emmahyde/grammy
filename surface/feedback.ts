import { TAGS, type FeedbackAnnotation, type FeedbackPayload, type Tag, type Target } from './protocol.ts'

const MAX_MESSAGE = 4000
const MAX_NOTE = 2000
const MAX_ANNOTATIONS = 100
const MAX_FIELD = 500

function fail(why: string): never {
  throw new Error(why)
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function parseTarget(raw: unknown): Target {
  if (typeof raw !== 'object' || raw === null) fail('annotation target must be an object')
  const t = raw as Record<string, unknown>
  if (t.kind === 'node') {
    const id = text(t.id, MAX_FIELD)
    if (id === '') fail('node target needs an id')
    return { kind: 'node', id, label: text(t.label, MAX_FIELD), shape: text(t.shape, 40) }
  }
  if (t.kind === 'edge') {
    const source = text(t.source, MAX_FIELD)
    const target = text(t.target, MAX_FIELD)
    if (source === '' || target === '') fail('edge target needs source and target')
    const index = typeof t.index === 'number' && Number.isInteger(t.index) && t.index >= 0 ? t.index : 0
    return { kind: 'edge', source, target, label: text(t.label, MAX_FIELD), index }
  }
  return fail('annotation target kind must be "node" or "edge"')
}

function parseAnnotation(raw: unknown): FeedbackAnnotation {
  if (typeof raw !== 'object' || raw === null) fail('annotation must be an object')
  const a = raw as Record<string, unknown>
  const tag = a.tag == null ? null : (TAGS as readonly unknown[]).includes(a.tag) ? (a.tag as Tag) : fail('unknown tag')
  const note = text(a.note, MAX_NOTE).trim()
  if (note === '') fail('annotation note is empty')
  return { target: parseTarget(a.target), tag, note }
}

/** Validates an untrusted request body. Throws an Error whose message is safe to return to the client. */
export function parseFeedback(raw: unknown): FeedbackPayload {
  if (typeof raw !== 'object' || raw === null) fail('body must be an object')
  const b = raw as Record<string, unknown>
  if (b.decision !== 'revise' && b.decision !== 'approve') fail('decision must be "revise" or "approve"')
  const annotations = Array.isArray(b.annotations) ? b.annotations : []
  if (annotations.length > MAX_ANNOTATIONS) fail(`at most ${MAX_ANNOTATIONS} annotations`)
  const payload: FeedbackPayload = {
    decision: b.decision,
    message: text(b.message, MAX_MESSAGE).trim(),
    annotations: annotations.map(parseAnnotation),
  }
  if (payload.decision === 'revise' && payload.message === '' && payload.annotations.length === 0) {
    fail('nothing to send: add an overall note or a comment')
  }
  return payload
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ARROW = /(--|==|-\.|~~~)/

/**
 * 1-based line numbers in `source` that mention the target. A search hit, not a parse:
 * a node id matches every line that names it; an edge matches lines naming both ends beside an arrow.
 */
export function sourceLines(source: string, target: Target): number[] {
  const mentions = (line: string, id: string) => new RegExp(`(?<![\\w-])${escapeRegExp(id)}(?![\\w-])`).test(line)
  const hits: number[] = []
  source.split('\n').forEach((line, i) => {
    if (line.trim().startsWith('%%')) return
    const hit =
      target.kind === 'node'
        ? mentions(line, target.id)
        : mentions(line, target.source) && mentions(line, target.target) && ARROW.test(line)
    if (hit) hits.push(i + 1)
  })
  return hits
}

function describe(target: Target): string {
  if (target.kind === 'node') {
    const label = target.label === '' ? '' : ` ${JSON.stringify(target.label)}`
    const shape = target.shape === '' ? '' : ` (${target.shape})`
    return `node \`${target.id}\`${label}${shape}`
  }
  const label = target.label === '' ? '' : ` ${JSON.stringify(target.label)}`
  return `edge \`${target.source}\` → \`${target.target}\`${label} (edge #${target.index + 1} in file order)`
}

export interface RenderContext {
  /** Path of the shared diagram, relative to the project root. */
  file: string
  /** Current text of the shared diagram, for source-line lookups. */
  source: string
  seq: number
}

/** The block the agent receives. Hard-scoped: it names exactly what may change. */
export function renderFeedback(payload: FeedbackPayload, ctx: RenderContext): string {
  const out: string[] = [`<diagram-feedback seq="${ctx.seq}" decision="${payload.decision}" file="${ctx.file}">`]

  if (payload.decision === 'approve') {
    out.push('The human approved the current diagram. Make no further changes unless the notes below ask for them.')
  } else if (payload.annotations.length > 0 && payload.message === '') {
    out.push(
      'Hard scope: change ONLY the nodes and edges listed under Comments. ' +
        'Leave every other node, edge, label and style exactly as it is.',
    )
  } else if (payload.annotations.length > 0) {
    out.push(
      'The overall note sets the direction for the diagram. The comments point at specific items. ' +
        'Do not change parts of the diagram that neither the note nor a comment covers.',
    )
  } else {
    out.push('The overall note sets the direction for the whole diagram.')
  }
  out.push(`Edit \`${ctx.file}\` directly. Do not edit the layout file: the surface owns node positions.`)

  if (payload.message !== '') {
    out.push('', '## Overall note', '', payload.message)
  }

  if (payload.annotations.length > 0) {
    out.push('', '## Comments')
    payload.annotations.forEach((a, i) => {
      const lines = sourceLines(ctx.source, a.target)
      out.push('', `### ${i + 1}. ${describe(a.target)}${a.tag == null ? '' : ` [${a.tag}]`}`)
      out.push(lines.length > 0 ? `Lines mentioning it: ${lines.join(', ')}` : 'Lines mentioning it: none (it may have been removed)')
      out.push('', ...a.note.split('\n').map((l) => `> ${l}`))
    })
  }

  out.push('', 'When you are done editing, run `npm run wait` to receive the next round.', '</diagram-feedback>')
  return out.join('\n') + '\n'
}
