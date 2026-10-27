import type { Target } from './annotations'

export type TokenKind = 'keyword' | 'id' | 'arrow' | 'label' | 'comment' | 'punct'

export interface Token {
  from: number
  to: number
  kind: TokenKind
  text: string
}

export interface CodeRange {
  from: number
  to: number
}

const STATEMENT = new Set(['flowchart', 'graph', 'subgraph', 'end', 'classDef', 'class', 'style', 'linkStyle', 'direction', 'click'])
const DIRECTIONS = new Set(['TD', 'TB', 'LR', 'RL', 'BT'])
const TAKES_DIRECTION = new Set(['flowchart', 'graph', 'direction'])

// Alternatives are tried in this order at each position: comment, bracketed node label,
// |edge label|, arrow, word, punctuation. Arrows come before words so `A-->B` splits cleanly.
const TOKEN =
  /(%%.*)|(\[\[.*?\]\]|\[.*?\]|\(\(.*?\)\)|\(.*?\)|\{\{.*?\}\}|\{.*?\}|>.*?\])|(\|[^|]*\|)|([<ox]?(?:-{2,}>?|={2,}>?|-\.+->?|~{3,})[ox]?)|([A-Za-z_]\w*)|([&;:,]+)/g

/** Split one line of mermaid flowchart text into tokens. `offset` is the line's start in the document. */
export function tokenizeLine(line: string, offset = 0): Token[] {
  const out: Token[] = []
  for (const m of line.matchAll(TOKEN)) {
    const from = offset + (m.index ?? 0)
    const text = m[0]
    let kind: TokenKind
    if (m[1] != null) kind = 'comment'
    else if (m[2] != null || m[3] != null) kind = 'label'
    else if (m[4] != null) kind = 'arrow'
    else if (m[5] != null) {
      const prev = out[out.length - 1]
      const statementStart = out.length === 0 && STATEMENT.has(text)
      const directionValue = prev?.kind === 'keyword' && TAKES_DIRECTION.has(prev.text) && DIRECTIONS.has(text)
      kind = statementStart || directionValue ? 'keyword' : 'id'
    } else kind = 'punct'
    out.push({ from, to: from + text.length, kind, text })
  }
  return out
}

/**
 * The text a canvas item is written as, so the code pane can highlight it.
 * A node is every mention of its id (with its bracket label when it is declared inline).
 * An edge is `source … target` including the arrow and any |label|.
 */
export function referencesIn(text: string, target: Target): CodeRange[] {
  const out: CodeRange[] = []
  let offset = 0
  for (const line of text.split('\n')) {
    const tokens = tokenizeLine(line, offset)
    offset += line.length + 1

    // a node mention is its id plus a bracket label that touches it
    let left: { id: string; from: number } | null = null
    let arrowSeen = false
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.kind === 'id') {
        const next = tokens[i + 1]
        const to = next?.kind === 'label' && next.from === t.to && next.text[0] !== '|' ? next.to : t.to
        if (target.kind === 'node') {
          if (t.text === target.id) out.push({ from: t.from, to })
        } else if (left != null && arrowSeen && left.id === target.source && t.text === target.target) {
          out.push({ from: left.from, to })
        }
        left = { id: t.text, from: t.from }
        arrowSeen = false
        if (to !== t.to) i++
      } else if (t.kind === 'arrow') arrowSeen = left != null
      else if (t.kind === 'punct' && t.text.includes(';')) {
        left = null
        arrowSeen = false
      }
    }
  }
  return out
}
