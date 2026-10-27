import { describe, expect, it } from 'vitest'
import { parseFeedback, renderFeedback, sourceLines } from './feedback.ts'
import type { FeedbackPayload } from './protocol.ts'

const SOURCE = `flowchart TD
  %% A is the entry point
  A[Start] --> AB[Other]
  A -->|go| B{Choice}
  B -.-> A
  AB --- B`

describe('parseFeedback', () => {
  it('rejects a revise with nothing to say', () => {
    expect(() => parseFeedback({ decision: 'revise', message: '  ', annotations: [] })).toThrow(/nothing to send/)
  })

  it('accepts an approve with no content', () => {
    expect(parseFeedback({ decision: 'approve' })).toEqual({ decision: 'approve', message: '', annotations: [] })
  })

  it('rejects unknown tags, empty notes and bad targets instead of dropping them', () => {
    const target = { kind: 'node', id: 'A', label: 'Start', shape: 'rectangle' }
    expect(() => parseFeedback({ decision: 'revise', annotations: [{ target, tag: 'urgent', note: 'x' }] })).toThrow(/tag/)
    expect(() => parseFeedback({ decision: 'revise', annotations: [{ target, tag: null, note: '  ' }] })).toThrow(/empty/)
    expect(() => parseFeedback({ decision: 'revise', annotations: [{ target: { kind: 'edge', source: 'A' }, note: 'x' }] })).toThrow(/source and target/)
  })

  it('caps the number of annotations', () => {
    const target = { kind: 'node', id: 'A', label: '', shape: '' }
    const annotations = Array.from({ length: 101 }, () => ({ target, tag: null, note: 'x' }))
    expect(() => parseFeedback({ decision: 'revise', annotations })).toThrow(/at most/)
  })
})

describe('sourceLines', () => {
  it('matches a node id as a whole token, not as a prefix of another id', () => {
    expect(sourceLines(SOURCE, { kind: 'node', id: 'A', label: '', shape: '' })).toEqual([3, 4, 5])
  })

  it('skips comment lines', () => {
    expect(sourceLines(SOURCE, { kind: 'node', id: 'A', label: '', shape: '' })).not.toContain(2)
  })

  it('matches an edge only on lines that name both ends beside an arrow', () => {
    expect(sourceLines(SOURCE, { kind: 'edge', source: 'A', target: 'B', label: 'go', index: 1 })).toEqual([4, 5])
  })
})

describe('renderFeedback', () => {
  const ctx = { file: 'design.mmd', source: SOURCE, seq: 3 }
  const comment = {
    target: { kind: 'node' as const, id: 'B', label: 'Choice', shape: 'diamond' },
    tag: 'blocking' as const,
    note: 'Split this in two.\nSecond line.',
  }

  it('hard-scopes a comments-only revise to the listed items', () => {
    const out = renderFeedback({ decision: 'revise', message: '', annotations: [comment] }, ctx)
    expect(out).toContain('<diagram-feedback seq="3" decision="revise" file="design.mmd">')
    expect(out).toContain('Hard scope: change ONLY the nodes and edges listed under Comments.')
    expect(out).toContain('### 1. node `B` "Choice" (diamond) [blocking]')
    expect(out).toContain('Lines mentioning it: 4, 5, 6')
    expect(out).toContain('> Split this in two.\n> Second line.')
    expect(out.trimEnd().endsWith('</diagram-feedback>')).toBe(true)
  })

  it('does not hard-scope when an overall note sets the direction', () => {
    const payload: FeedbackPayload = { decision: 'revise', message: 'Add a payment step.', annotations: [comment] }
    const out = renderFeedback(payload, ctx)
    expect(out).not.toContain('Hard scope')
    expect(out).toContain('## Overall note\n\nAdd a payment step.')
    expect(out).toContain('## Comments')
  })

  it('tells the agent an approval needs no changes', () => {
    const out = renderFeedback({ decision: 'approve', message: '', annotations: [] }, ctx)
    expect(out).toContain('The human approved the current diagram.')
    expect(out).not.toContain('## Comments')
  })

  it('says so when a commented item no longer exists in the file', () => {
    const gone = { ...comment, target: { kind: 'node' as const, id: 'ZZ', label: 'Gone', shape: '' } }
    expect(renderFeedback({ decision: 'revise', message: '', annotations: [gone] }, ctx)).toContain('none (it may have been removed)')
  })
})
