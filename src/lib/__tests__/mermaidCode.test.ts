import { describe, expect, it } from 'vitest'
import { referencesIn, tokenizeLine } from '../mermaidCode'

const node = (id: string) => ({ kind: 'node', id, label: id, shape: 'rectangle' }) as const
const edge = (source: string, target: string) => ({ kind: 'edge', source, target, label: '', index: 0 }) as const
const slices = (text: string, ranges: { from: number; to: number }[]) => ranges.map((r) => text.slice(r.from, r.to))

describe('tokenizeLine', () => {
  it('splits ids, labels and arrows without spaces around the arrow', () => {
    const kinds = tokenizeLine('A[Start]-->B{Go?}').map((t) => `${t.kind}:${t.text}`)
    expect(kinds).toEqual(['id:A', 'label:[Start]', 'arrow:-->', 'id:B', 'label:{Go?}'])
  })

  it('treats a direction as a keyword only after flowchart', () => {
    expect(tokenizeLine('flowchart TD').map((t) => t.kind)).toEqual(['keyword', 'keyword'])
    expect(tokenizeLine('  TD --> LR').map((t) => t.kind)).toEqual(['id', 'arrow', 'id'])
  })

  it('keeps a trailing comment as one token, including the layout line', () => {
    const t = tokenizeLine('%% mc:layout {"nodes":{"a":{"x":1}}}')
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('comment')
  })
})

describe('referencesIn', () => {
  const text = [
    'flowchart TD',
    '  idea[What are we designing?] --> sketch',
    '  done[done?]',
    '  sketch --> review',
    '  review -->|no| sketch',
    '  a --> b --> c',
    '  style done fill:red',
    '  %% done sketch',
  ].join('\n')

  it('finds a node by id, with its inline label, and ignores label text and comments', () => {
    expect(slices(text, referencesIn(text, node('done')))).toEqual(['done[done?]', 'done'])
  })

  it('does not match an id that is only part of a longer word', () => {
    expect(referencesIn('  sketchy --> x', node('sketch'))).toEqual([])
  })

  it('highlights an edge from source to target including its label', () => {
    expect(slices(text, referencesIn(text, edge('review', 'sketch')))).toEqual(['review -->|no| sketch'])
  })

  it('takes only the matching link of a chain', () => {
    expect(slices(text, referencesIn(text, edge('b', 'c')))).toEqual(['b --> c'])
  })

  it('does not treat a reversed pair as the same edge', () => {
    expect(referencesIn('  a --> b', edge('b', 'a'))).toEqual([])
  })
})
