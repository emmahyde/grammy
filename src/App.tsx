import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type {
  Direction,
  EdgeCurve,
  EdgeStyle,
  FlowDoc,
  MermaidShape,
  ShapeNode as ShapeNodeType,
} from './lib/model'
import { renderMermaidSVG } from 'beautiful-mermaid'
import { detectKind, extractLayoutMeta, parseFlowchart, stripLayoutMeta } from './lib/parse'
import { lacksPositions, layoutMetaFor, serializeFlowchart, withLayoutMeta } from './lib/serialize'
import { docToSvg } from './lib/svgExport'
import { layoutDoc, type LayoutMode } from './lib/layout'
import { ShapeNode, SubgraphNode } from './components/ShapeNode'
import { FlowEdgeComp } from './components/FlowEdge'
import { Toolbar } from './components/Toolbar'
import { SelectionToolbar, type Selection } from './components/SelectionToolbar'
import { CodePane } from './components/CodePane'
import { Preview } from './components/Preview'
import { CollabPanel } from './components/CollabPanel'
import { diffDocs, isEmptyDiff, type DocDiff } from './lib/diff'
import { pinsByNode, targetExists, targetFor, toFeedback, type Annotation, type Tag, type Target } from './lib/annotations'
import { composeDoc, loadDoc, saveDoc, sendFeedback, splitDoc, subscribe } from './lib/surfaceClient'
import type { Decision, DocSnapshot, SurfaceStatus } from '../surface/protocol'
import './App.css'

const STORAGE_KEY = 'grammy:doc'
const NOTES_KEY = 'grammy:annotations'
const MESSAGE_KEY = 'grammy:message'

const DEFAULT_TEXT = `flowchart TD
  A[Start] --> B{Ship it?}
  B -->|yes| C([Deploy])
  B -->|no| D[Iterate]
  D --> A`

const nodeTypes = { shape: ShapeNode, subgraph: SubgraphNode }
const edgeTypes = { flow: FlowEdgeComp }

const SUBGRAPH_PAD = { top: 44, side: 20, bottom: 20 }

interface AppState {
  text: string
  doc: FlowDoc | null
  parseError: string | null
}

function tryParse(text: string): { doc: FlowDoc | null; error: string | null } {
  if (detectKind(text) !== 'flowchart') return { doc: null, error: null }
  try {
    return { doc: parseFlowchart(text), error: null }
  } catch (e) {
    return { doc: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Staged comments survive a reload. Anything that does not look like a comment is dropped. */
function loadAnnotations(): Annotation[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (a): a is Annotation =>
        typeof a === 'object' &&
        a !== null &&
        typeof a.id === 'string' &&
        typeof a.note === 'string' &&
        typeof a.target === 'object' &&
        a.target !== null &&
        (a.target.kind === 'node' || a.target.kind === 'edge'),
    )
  } catch {
    return []
  }
}

function summarize(d: DocDiff): string {
  const parts = [
    d.addedNodes.length > 0 && `+${d.addedNodes.length} node${d.addedNodes.length === 1 ? '' : 's'}`,
    d.changedNodes.length > 0 && `~${d.changedNodes.length} changed`,
    d.removedNodes.length > 0 && `−${d.removedNodes.length} node${d.removedNodes.length === 1 ? '' : 's'}`,
    d.addedEdges.length > 0 && `+${d.addedEdges.length} edge${d.addedEdges.length === 1 ? '' : 's'}`,
    d.removedEdges > 0 && `−${d.removedEdges} edge${d.removedEdges === 1 ? '' : 's'}`,
  ].filter((p): p is string => p !== false)
  return parts.length > 0 ? parts.join(' · ') : 'layout only'
}

function PreviewEngineToggle(props: {
  engine: 'canvas' | 'mermaid'
  onChange: (e: 'canvas' | 'mermaid') => void
}) {
  return (
    <div className="view-toggle preview-engine-toggle">
      <button className={props.engine === 'canvas' ? 'on' : ''} onClick={() => props.onChange('canvas')}>
        As arranged
      </button>
      <button className={props.engine === 'mermaid' ? 'on' : ''} onClick={() => props.onChange('mermaid')}>
        Beautiful Mermaid
      </button>
    </div>
  )
}

function Editor({ initial }: { initial: DocSnapshot | null }) {
  // a linked surface file wins; localStorage is the fallback when no server answered
  const initialText = useMemo(
    () => (initial != null ? composeDoc(initial.text, initial.layout) : (localStorage.getItem(STORAGE_KEY) ?? DEFAULT_TEXT)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const initialParse = useMemo(() => tryParse(initialText), [initialText])
  const initialMeta = useMemo(() => extractLayoutMeta(initialText), [initialText])

  const [state, setState] = useState<AppState>({
    text: initialText,
    doc: initialParse.doc,
    parseError: initialParse.error,
  })
  const [autoLayout, setAutoLayout] = useState(initialMeta?.autoLayout ?? true)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('hierarchical')
  const [curves, setCurves] = useState<Record<number, EdgeCurve>>(initialMeta?.curves ?? {})
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [previewEngine, setPreviewEngine] = useState<'canvas' | 'mermaid'>('canvas')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(new Set())

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idCounter = useRef(0)
  const rf = useReactFlow()

  const kind = detectKind(state.text)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, state.text)
  }, [state.text])

  // initial doc with no saved positions → one layout pass
  useEffect(() => {
    if (initialParse.doc != null && lacksPositions(initialParse.doc, initialMeta) && (initialMeta?.autoLayout ?? true)) {
      void layoutDoc(initialParse.doc, 'hierarchical').then((nodes) => {
        setState((p) => {
          if (p.doc !== initialParse.doc) return p
          const doc = { ...p.doc!, nodes }
          // the shared file may have been edited while the page was closed: save the new positions beside it
          const text =
            initial != null
              ? withLayoutMeta(p.text, layoutMetaFor(doc, initialMeta?.autoLayout ?? true, initialMeta?.curves ?? {}, initialMeta))
              : p.text
          return { ...p, text, doc }
        })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Canvas-originated update: doc → text; the text stays the source of truth. */
  const emit = useCallback(
    (doc: FlowDoc, opts?: { autoLayout?: boolean; curves?: Record<number, EdgeCurve> }) => {
      const al = opts?.autoLayout ?? autoLayout
      const cv = opts?.curves ?? curves
      const meta = layoutMetaFor(doc, al, cv)
      const text = serializeFlowchart(doc, meta)
      setState({ text, doc, parseError: null })
    },
    [autoLayout, curves],
  )

  const docRef = useRef(state.doc)
  docRef.current = state.doc

  /** Apply a canvas mutation; auto-layout first when it's a structural change. */
  const applyDocChange = useCallback(
    (mutate: (doc: FlowDoc) => FlowDoc, structural = true) => {
      const cur = docRef.current
      if (cur == null) return
      const next = mutate(cur)
      if (structural && autoLayout) {
        void layoutDoc(next, layoutMode).then((nodes) => emit({ ...next, nodes }))
      } else {
        emit(next)
      }
    },
    [autoLayout, layoutMode, emit],
  )

  /** Code-pane-originated update, debounced. */
  // uiw's CodeMirror tags prop-driven value updates with its ExternalChange annotation and
  // never fires onChange for them, so every call here is a genuine user edit.
  const onCodeChange = useCallback((text: string) => {
    setState((prev) => ({ ...prev, text }))
    if (debounceTimer.current != null) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      const { doc, error } = tryParse(text)
      const meta = extractLayoutMeta(text)
      if (meta?.autoLayout != null) setAutoLayout(meta.autoLayout)
      if (meta?.curves != null) setCurves(meta.curves)
      setState((prev) => {
        if (prev.text !== text) return prev
        if (doc == null && error != null) return { ...prev, parseError: error }
        if (doc == null) return { ...prev, doc: null, parseError: null }
        if (meta == null && doc.nodes.length > 0) {
          // never positioned → run one layout pass
          void layoutDoc(doc, 'hierarchical').then((nodes) => {
            setState((p) => (p.text === text ? { ...p, doc: { ...doc, nodes }, parseError: null } : p))
          })
        }
        return { ...prev, doc, parseError: null }
      })
    }, 300)
  }, [])

  // ---- shared file with the agent --------------------------------------------
  // On disk the diagram is pure Mermaid (design.mmd) and the layout line lives beside it.
  // The browser writes its own edits, debounced, and applies the agent's edits as they arrive.

  const linked = initial != null
  const [connected, setConnected] = useState(linked)
  const [status, setStatus] = useState<SurfaceStatus | null>(null)
  const [conflict, setConflict] = useState<DocSnapshot | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [agentChange, setAgentChange] = useState<{ diff: DocDiff | null; error: string | null } | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [annotations, setAnnotations] = useState<Annotation[]>(loadAnnotations)
  const [message, setMessage] = useState(() => localStorage.getItem(MESSAGE_KEY) ?? '')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [lastSent, setLastSent] = useState<{ seq: number; decision: Decision } | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  // the last revision both sides agree on; a human edit is "dirty" while it differs from this
  const syncRef = useRef<{ rev: number; text: string; layout: string | null } | null>(
    initial == null ? null : { rev: initial.rev, text: initial.text, layout: initial.layout },
  )
  const textRef = useRef(state.text)
  textRef.current = state.text
  const conflictRef = useRef(conflict)
  conflictRef.current = conflict
  const autoLayoutRef = useRef(autoLayout)
  autoLayoutRef.current = autoLayout
  const curvesRef = useRef(curves)
  curvesRef.current = curves
  const pushChain = useRef<Promise<void>>(Promise.resolve())
  const ingestSeq = useRef(0)
  const live = useRef<{ doc: (s: DocSnapshot) => void; open: () => void }>({ doc: () => {}, open: () => {} })

  /** Save the human's version now. Saves run one at a time so each one carries the revision the last returned. */
  function pushNow(): Promise<void> {
    pushChain.current = pushChain.current.then(async () => {
      const base = syncRef.current
      const mine = splitDoc(textRef.current)
      if (base == null || conflictRef.current != null) return
      if (base.text === mine.text && base.layout === mine.layout) return
      try {
        const res = await saveDoc({ baseRev: base.rev, text: mine.text, layout: mine.layout })
        if (res.ok) syncRef.current = { rev: res.rev, text: mine.text, layout: mine.layout }
        else setConflict(res.conflict)
        setSaveError(null)
      } catch (e) {
        setSaveError(`Could not save ${initial?.file ?? 'the shared file'}: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
    return pushChain.current
  }

  /** Apply text that came from outside the editor. The agent's wording is kept byte for byte; only the layout line is rewritten. */
  async function applyExternal(full: string, fromAgent: boolean): Promise<void> {
    const seq = ++ingestSeq.current
    const { doc, error } = tryParse(full)
    const meta = extractLayoutMeta(full)
    if (meta?.autoLayout != null) setAutoLayout(meta.autoLayout)
    if (meta?.curves != null) setCurves(meta.curves)
    if (doc == null) {
      // keep the last good canvas on a syntax error; a non-flowchart has no canvas
      setState((p) => ({ text: full, doc: error == null ? null : p.doc, parseError: error }))
      if (fromAgent && error != null) setAgentChange({ diff: null, error })
      return
    }
    const diff = diffDocs(docRef.current, doc)
    const al = meta?.autoLayout ?? autoLayoutRef.current
    const cv = meta?.curves ?? curvesRef.current
    let next = doc
    if (al && (diff.structural || lacksPositions(doc, meta))) {
      setState({ text: full, doc, parseError: null }) // show it at once; positions follow
      const nodes = await layoutDoc(doc, layoutMode)
      if (seq !== ingestSeq.current) return
      next = { ...doc, nodes }
    }
    setState({ text: withLayoutMeta(full, layoutMetaFor(next, al, cv, meta)), doc: next, parseError: null })
    if (fromAgent && !isEmptyDiff(diff)) setAgentChange({ diff, error: null })
  }

  live.current = {
    doc: (snap) => {
      const s = syncRef.current
      if (s != null && snap.rev === s.rev) return
      if (s != null && snap.text === s.text && snap.layout === s.layout) {
        syncRef.current = { ...s, rev: snap.rev } // same content under a new revision, e.g. the server restarted
        return
      }
      const mine = splitDoc(textRef.current)
      const clean = s != null && mine.text === s.text && mine.layout === s.layout
      if (!clean) {
        setConflict(snap)
        return
      }
      syncRef.current = { rev: snap.rev, text: snap.text, layout: snap.layout }
      void applyExternal(composeDoc(snap.text, snap.layout), snap.author === 'agent')
    },
    open: () => void pushNow(),
  }

  useEffect(() => {
    if (!linked) return
    return subscribe({
      onDoc: (s) => live.current.doc(s),
      onStatus: setStatus,
      onConnection: (up) => {
        setConnected(up)
        if (up) live.current.open()
      },
    })
  }, [linked])

  useEffect(() => {
    if (!linked || conflict != null) return
    const s = syncRef.current
    const mine = splitDoc(state.text)
    if (s == null || (s.text === mine.text && s.layout === mine.layout)) return
    const timer = setTimeout(() => void pushNow(), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.text, conflict, linked])

  // the glow on what the agent touched fades; a syntax error stays until the next edit
  useEffect(() => {
    if (agentChange == null || agentChange.error != null) return
    const t = setTimeout(() => setAgentChange(null), 8000)
    return () => clearTimeout(t)
  }, [agentChange])

  function takeTheirs() {
    const theirs = conflictRef.current
    if (theirs == null) return
    syncRef.current = { rev: theirs.rev, text: theirs.text, layout: theirs.layout }
    setConflict(null)
    void applyExternal(composeDoc(theirs.text, theirs.layout), true)
  }

  function keepMine() {
    const theirs = conflictRef.current
    if (theirs == null) return
    // adopt their revision as the base; the human's text still differs, so the next save overwrites
    syncRef.current = { rev: theirs.rev, text: theirs.text, layout: theirs.layout }
    setConflict(null)
  }

  // ---- comments ---------------------------------------------------------------

  useEffect(() => localStorage.setItem(NOTES_KEY, JSON.stringify(annotations)), [annotations])
  useEffect(() => localStorage.setItem(MESSAGE_KEY, message), [message])

  const selTarget = useMemo(
    () => (selection != null && state.doc != null ? targetFor(selection, state.doc) : null),
    [selection, state.doc],
  )
  const pins = useMemo(() => pinsByNode(annotations), [annotations])
  const agentMarks = useMemo(
    () => ({
      added: new Set(agentChange?.diff?.addedNodes ?? []),
      changed: new Set(agentChange?.diff?.changedNodes ?? []),
      edges: new Set(agentChange?.diff?.addedEdges ?? []),
    }),
    [agentChange],
  )

  const addComment = (note: string, tag: Tag | null) => {
    if (selTarget == null) return
    setAnnotations((a) => [...a, { id: crypto.randomUUID(), target: selTarget, tag, note }])
  }

  function locate(t: Target) {
    const nodes = t.kind === 'node' ? [{ id: t.id }] : [{ id: t.source }, { id: t.target }]
    void rf.fitView({ nodes, duration: 300, maxZoom: 1.2 })
  }

  async function send(decision: Decision) {
    setSending(true)
    setSendError(null)
    try {
      if (conflictRef.current != null) throw new Error('Resolve the conflict with the agent first.')
      await pushNow() // the agent should read the diagram the human is looking at
      const { seq } = await sendFeedback({ decision, message: message.trim(), annotations: toFeedback(annotations) })
      setLastSent({ seq, decision })
      setAnnotations([])
      setMessage('')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  // C: jump to the comment box for the selected item
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey || !panelOpen || selTarget == null) return
      const from = e.target instanceof Element ? e.target : null
      if (from?.closest('input, textarea, select, [contenteditable="true"], .cm-editor') != null) return
      e.preventDefault()
      composerRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, selTarget])

  // ---- React Flow derived state --------------------------------------------

  const rfNodes = useMemo((): Node[] => {
    if (state.doc == null) return []
    const memberBoxes: Node[] = state.doc.subgraphs.flatMap((sg) => {
      const members = state.doc!.nodes.filter((n) => sg.nodeIds.includes(n.id))
      if (members.length === 0) return []
      const minX = Math.min(...members.map((n) => n.position.x)) - SUBGRAPH_PAD.side
      const minY = Math.min(...members.map((n) => n.position.y)) - SUBGRAPH_PAD.top
      const maxX = Math.max(...members.map((n) => n.position.x + (n.width ?? 160))) + SUBGRAPH_PAD.side
      const maxY = Math.max(...members.map((n) => n.position.y + (n.height ?? 52))) + SUBGRAPH_PAD.bottom
      return [
        {
          id: `sg:${sg.id}`,
          type: 'subgraph',
          position: { x: minX, y: minY },
          width: maxX - minX,
          height: maxY - minY,
          data: { label: sg.label },
          selectable: false,
          draggable: false,
          focusable: false,
          zIndex: -1,
        },
      ]
    })
    const nodes = state.doc.nodes.map((n) => {
      const pin = pins.get(n.id)
      const mark = agentMarks.added.has(n.id) ? 'agent-new' : agentMarks.changed.has(n.id) ? 'agent-changed' : undefined
      if (pin == null && mark == null) return n
      return { ...n, className: mark ?? n.className, data: pin == null ? n.data : { ...n.data, pins: pin } }
    })
    return [...memberBoxes, ...nodes]
  }, [state.doc, pins, agentMarks])

  const rfEdges = useMemo((): Edge[] => {
    if (state.doc == null) return []
    const centers = new Map(
      state.doc.nodes.map((n) => [
        n.id,
        {
          x: n.position.x + (n.measured?.width ?? n.width ?? 160) / 2,
          y: n.position.y + (n.measured?.height ?? n.height ?? 52) / 2,
        },
      ]),
    )
    return state.doc.edges.map((e, i) => {
      const stroke = e.data?.styleProps?.stroke ?? '#565f89'
      // route via the sides facing each other, unless handles were chosen by hand
      let handles: { sourceHandle?: string; targetHandle?: string } = {}
      const s = centers.get(e.source)
      const t = centers.get(e.target)
      if (e.sourceHandle == null && e.targetHandle == null && s != null && t != null) {
        const dx = t.x - s.x
        const dy = t.y - s.y
        handles =
          Math.abs(dy) >= Math.abs(dx)
            ? dy >= 0
              ? { sourceHandle: 'b', targetHandle: 't' }
              : { sourceHandle: 't', targetHandle: 'b' }
            : dx >= 0
              ? { sourceHandle: 'r', targetHandle: 'l' }
              : { sourceHandle: 'l', targetHandle: 'r' }
      }
      return {
        ...e,
        ...handles,
        selected: selectedEdgeIds.has(e.id),
        className: agentMarks.edges.has(e.id) ? 'agent-new' : e.className,
        data: { ...e.data, curve: curves[i] ?? 'default' },
        markerStart: e.data?.hasArrowStart
          ? { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 }
          : undefined,
        markerEnd: e.data?.hasArrowEnd
          ? { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 }
          : undefined,
      }
    })
  }, [state.doc, curves, selectedEdgeIds, agentMarks])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // controlled edges: apply select/remove so edge clicks reach onSelectionChange
    setSelectedEdgeIds((prev) => {
      let next: Set<string> | null = null
      for (const c of changes) {
        if (c.type === 'select') {
          next ??= new Set(prev)
          if (c.selected) next.add(c.id)
          else next.delete(c.id)
        } else if (c.type === 'remove') {
          next ??= new Set(prev)
          next.delete(c.id)
        }
      }
      return next ?? prev
    })
  }, [])

  // ---- canvas handlers ------------------------------------------------------

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // apply position/selection changes live for smooth dragging; persist on drag end
    setState((prev) => {
      if (prev.doc == null) return prev
      const own = changes.filter((c) => !('id' in c && typeof c.id === 'string' && c.id.startsWith('sg:')))
      const nodes = applyNodeChanges(own, prev.doc.nodes as Node[]) as ShapeNodeType[]
      return { ...prev, doc: { ...prev.doc, nodes } }
    })
  }, [])

  const onNodeDragStop = useCallback(() => {
    if (docRef.current != null) emit(docRef.current)
  }, [emit])

  const onConnect = useCallback(
    (conn: Connection) => {
      if (conn.source === '' || conn.target === '') return
      applyDocChange((doc) => ({
        ...doc,
        edges: [
          ...doc.edges,
          {
            id: `e${doc.edges.length}-${conn.source}-${conn.target}`,
            source: conn.source,
            target: conn.target,
            type: 'flow',
            data: { edgeStyle: 'solid', hasArrowStart: false, hasArrowEnd: true, styleProps: {} },
          },
        ],
      }))
    },
    [applyDocChange],
  )

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ids = new Set(deleted.map((n) => n.id))
      applyDocChange((doc) => ({
        ...doc,
        nodes: doc.nodes.filter((n) => !ids.has(n.id)),
        edges: doc.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
        subgraphs: doc.subgraphs
          .map((sg) => ({ ...sg, nodeIds: sg.nodeIds.filter((id) => !ids.has(id)) }))
          .filter((sg) => sg.nodeIds.length > 0),
      }))
      setSelection(null)
    },
    [applyDocChange],
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const ids = new Set(deleted.map((e) => e.id))
      applyDocChange((doc) => ({ ...doc, edges: doc.edges.filter((e) => !ids.has(e.id)) }))
      setSelection(null)
    },
    [applyDocChange],
  )

  const onSelectionChange = useCallback(
    ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      const n = nodes.find((x) => x.type === 'shape') as ShapeNodeType | undefined
      if (n != null) {
        setSelection({
          kind: 'node',
          id: n.id,
          label: n.data.label,
          shape: n.data.shape,
          w: Math.round(n.width ?? 160),
          h: Math.round(n.height ?? 52),
        })
        return
      }
      const e = edges[0]
      const doc = docRef.current
      if (e != null && doc != null) {
        const idx = doc.edges.findIndex((x) => x.id === e.id)
        const d = doc.edges[idx]?.data
        setSelection({
          kind: 'edge',
          id: e.id,
          label: typeof e.label === 'string' ? e.label : '',
          edgeStyle: d?.edgeStyle ?? 'solid',
          hasArrowStart: d?.hasArrowStart ?? false,
          hasArrowEnd: d?.hasArrowEnd ?? true,
          curve: curves[idx] ?? 'default',
        })
        return
      }
      setSelection(null)
    },
    [curves],
  )

  // ---- toolbar actions ------------------------------------------------------

  const freshId = useCallback((doc: FlowDoc) => {
    let id: string
    do {
      idCounter.current += 1
      id = `n${idCounter.current}`
    } while (doc.nodes.some((n) => n.id === id))
    return id
  }, [])

  const insertNode = useCallback(
    (shape: MermaidShape, styleProps: Record<string, string> = {}) => {
      const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      applyDocChange((doc) => {
        const id = freshId(doc)
        return {
          ...doc,
          nodes: [
            ...doc.nodes,
            {
              id,
              type: 'shape',
              position: { x: center.x - 80, y: center.y - 26 },
              width: 160,
              height: 52,
              data: { label: id, shape, styleProps },
            },
          ],
        }
      }, false)
    },
    [applyDocChange, freshId, rf],
  )

  const addSubgraph = useCallback(() => {
    const selectedIds = rf
      .getNodes()
      .filter((n) => n.selected === true && n.type === 'shape')
      .map((n) => n.id)
    if (selectedIds.length === 0) return
    applyDocChange((doc) => {
      let i = doc.subgraphs.length
      let id: string
      do {
        i += 1
        id = `sg${i}`
      } while (doc.subgraphs.some((s) => s.id === id))
      return {
        ...doc,
        subgraphs: [
          ...doc.subgraphs
            .map((sg) => ({ ...sg, nodeIds: sg.nodeIds.filter((x) => !selectedIds.includes(x)) }))
            .filter((sg) => sg.nodeIds.length > 0),
          { id, label: 'Subgraph', nodeIds: selectedIds },
        ],
      }
    }, false)
  }, [applyDocChange, rf])

  const applyColor = useCallback(
    (fill: string) => {
      const selectedIds = new Set(
        rf.getNodes().filter((n) => n.selected === true && n.type === 'shape').map((n) => n.id),
      )
      if (selectedIds.size === 0) return
      applyDocChange(
        (doc) => ({
          ...doc,
          nodes: doc.nodes.map((n) =>
            selectedIds.has(n.id)
              ? { ...n, data: { ...n.data, styleProps: { ...n.data.styleProps, fill } } }
              : n,
          ),
        }),
        false,
      )
    },
    [applyDocChange, rf],
  )

  const changeDirection = useCallback(
    (direction: Direction) => {
      applyDocChange((doc) => ({ ...doc, direction }))
    },
    [applyDocChange],
  )

  const toggleAutoLayout = useCallback(
    (v: boolean) => {
      setAutoLayout(v)
      const doc = docRef.current
      if (doc == null) return
      if (v) {
        void layoutDoc(doc, layoutMode).then((nodes) => emit({ ...doc, nodes }, { autoLayout: v }))
      } else {
        emit(doc, { autoLayout: v })
      }
    },
    [emit, layoutMode],
  )

  const changeLayoutMode = useCallback(
    (m: LayoutMode) => {
      setLayoutMode(m)
      const doc = docRef.current
      if (autoLayout && doc != null) {
        void layoutDoc(doc, m).then((nodes) => emit({ ...doc, nodes }))
      }
    },
    [autoLayout, emit],
  )

  // ---- selection edits ------------------------------------------------------

  const onNodeEdit = useCallback(
    (patch: Partial<{ label: string; shape: MermaidShape; w: number; h: number }>) => {
      if (selection?.kind !== 'node') return
      setSelection({ ...selection, ...patch })
      applyDocChange(
        (doc) => ({
          ...doc,
          nodes: doc.nodes.map((n) =>
            n.id === selection.id
              ? {
                  ...n,
                  width: patch.w ?? n.width,
                  height: patch.h ?? n.height,
                  data: {
                    ...n.data,
                    label: patch.label ?? n.data.label,
                    shape: patch.shape ?? n.data.shape,
                  },
                }
              : n,
          ),
        }),
        false,
      )
    },
    [selection, applyDocChange],
  )

  const onEdgeEdit = useCallback(
    (
      patch: Partial<{
        label: string
        edgeStyle: EdgeStyle
        hasArrowStart: boolean
        hasArrowEnd: boolean
        curve: EdgeCurve
      }>,
    ) => {
      if (selection?.kind !== 'edge') return
      const doc = docRef.current
      if (doc == null) return
      setSelection({ ...selection, ...patch })
      if (patch.curve != null) {
        const idx = doc.edges.findIndex((e) => e.id === selection.id)
        if (idx >= 0) {
          const next = { ...curves, [idx]: patch.curve }
          setCurves(next)
          emit(doc, { curves: next })
        }
        return
      }
      applyDocChange(
        (d) => ({
          ...d,
          edges: d.edges.map((e) =>
            e.id === selection.id
              ? {
                  ...e,
                  label: patch.label ?? e.label,
                  data: {
                    edgeStyle: patch.edgeStyle ?? e.data!.edgeStyle,
                    hasArrowStart: patch.hasArrowStart ?? e.data!.hasArrowStart,
                    hasArrowEnd: patch.hasArrowEnd ?? e.data!.hasArrowEnd,
                    styleProps: e.data!.styleProps,
                  },
                }
              : e,
          ),
        }),
        false,
      )
    },
    [selection, curves, applyDocChange, emit],
  )

  const duplicateSelected = useCallback(() => {
    if (selection?.kind !== 'node') return
    applyDocChange((doc) => {
      const src = doc.nodes.find((n) => n.id === selection.id)
      if (src == null) return doc
      const id = freshId(doc)
      return {
        ...doc,
        nodes: [
          ...doc.nodes,
          { ...src, id, position: { x: src.position.x + 40, y: src.position.y + 40 }, data: { ...src.data } },
        ],
      }
    }, false)
  }, [selection, applyDocChange, freshId])

  const deleteSelected = useCallback(() => {
    if (selection == null) return
    if (selection.kind === 'node') onNodesDelete([{ id: selection.id } as Node])
    else onEdgesDelete([{ id: selection.id } as Edge])
  }, [selection, onNodesDelete, onEdgesDelete])

  // ---- export ---------------------------------------------------------------

  const download = useCallback((name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const exportMmd = useCallback(() => download('diagram.mmd', state.text, 'text/plain'), [download, state.text])

  const exportSvg = useCallback(() => {
    try {
      // WYSIWYG for flowcharts: serialize the canvas arrangement; beautiful-mermaid for everything else
      const svg =
        kind === 'flowchart' && state.doc != null
          ? docToSvg(state.doc, curves)
          : renderMermaidSVG(stripLayoutMeta(state.text), { bg: '#131320', fg: '#cdd3f5' })
      download('diagram.svg', svg, 'image/svg+xml')
    } catch (e) {
      alert(`SVG export failed: ${e instanceof Error ? e.message : e}`)
    }
  }, [download, state.text, state.doc, kind, curves])

  const canvasAvailable = kind === 'flowchart' && state.doc != null

  return (
    <div className="app">
      <header className="header">
        <div className="brand">Grammy</div>
        <div className="header-actions">
          <div className="view-toggle">
            <button className={view === 'edit' ? 'on' : ''} onClick={() => setView('edit')}>
              Canvas
            </button>
            <button className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}>
              Preview
            </button>
          </div>
          <button className={`hdr-btn${panelOpen ? ' active' : ''}`} aria-pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
            Collab{annotations.length > 0 ? ` · ${annotations.length}` : ''}
          </button>
          <button className="hdr-btn" onClick={exportMmd}>
            Export .mmd
          </button>
          <button className="hdr-btn" onClick={exportSvg}>
            Export SVG
          </button>
        </div>
      </header>
      {(conflict != null || saveError != null || agentChange != null) && (
        <div className="notices" role="status">
          {conflict != null && (
            <div className="notice warn">
              <span>
                The agent changed <code>{conflict.file}</code> while you had unsaved edits.
              </span>
              <button onClick={takeTheirs}>Take the agent&apos;s version</button>
              <button onClick={keepMine}>Keep mine</button>
            </div>
          )}
          {saveError != null && (
            <div className="notice warn">
              <span>{saveError}</span>
            </div>
          )}
          {agentChange != null && (
            <div className={`notice ${agentChange.error != null ? 'warn' : 'agent'}`}>
              <span>
                {agentChange.error != null
                  ? `The agent's last edit does not parse: ${agentChange.error}`
                  : `The agent edited ${initial?.file ?? 'the diagram'}: ${summarize(agentChange.diff!)}`}
              </span>
              <button onClick={() => setAgentChange(null)}>Dismiss</button>
            </div>
          )}
        </div>
      )}
      <div className="main">
        <div className="left">
          <CodePane value={state.text} onChange={onCodeChange} parseError={state.parseError} />
        </div>
        <div className="right">
          {view === 'preview' ? (
            canvasAvailable && previewEngine === 'canvas' ? (
              <div className="preview-flow">
                <ReactFlow
                  nodes={rfNodes}
                  edges={rfEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  connectionMode={ConnectionMode.Loose}
                  fitView
                  proOptions={{ hideAttribution: true }}
                  colorMode="dark"
                />
                <PreviewEngineToggle engine={previewEngine} onChange={setPreviewEngine} />
              </div>
            ) : (
              <div className="preview-flow">
                <Preview text={state.text} />
                {canvasAvailable && (
                  <PreviewEngineToggle engine={previewEngine} onChange={setPreviewEngine} />
                )}
              </div>
            )
          ) : canvasAvailable ? (
            <>
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
                onNodeDragStop={onNodeDragStop}
                onConnect={onConnect}
                onNodesDelete={onNodesDelete}
                onEdgesDelete={onEdgesDelete}
                onSelectionChange={onSelectionChange}
                connectionMode={ConnectionMode.Loose}
                fitView
                proOptions={{ hideAttribution: true }}
                colorMode="dark"
              >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
              <Toolbar
                autoLayout={autoLayout}
                onAutoLayoutChange={toggleAutoLayout}
                layoutMode={layoutMode}
                onLayoutModeChange={changeLayoutMode}
                direction={state.doc?.direction ?? 'TD'}
                onDirectionChange={changeDirection}
                onInsertShape={(s) => insertNode(s)}
                onInsertText={() => insertNode('rectangle', { fill: 'transparent', stroke: 'transparent' })}
                onAddSubgraph={addSubgraph}
                onColor={applyColor}
                hasSelection={selection?.kind === 'node'}
              />
              {selection != null && (
                <SelectionToolbar
                  sel={selection}
                  onNodeChange={onNodeEdit}
                  onEdgeChange={onEdgeEdit}
                  onDuplicate={duplicateSelected}
                  onDelete={deleteSelected}
                />
              )}
            </>
          ) : (
            <div className="canvas-unavailable">
              {kind === 'flowchart' ? (
                <p>Fix the mermaid syntax to see the canvas.</p>
              ) : (
                <p>
                  WYSIWYG editing is available for flowcharts. This diagram type renders in{' '}
                  <button className="linkish" onClick={() => setView('preview')}>
                    Preview
                  </button>
                  .
                </p>
              )}
            </div>
          )}
        </div>
        {panelOpen && (
          <CollabPanel
            linked={linked}
            connected={connected}
            file={initial?.file ?? null}
            status={status}
            lastSent={lastSent}
            selected={selTarget}
            annotations={annotations}
            exists={(t) => targetExists(t, state.doc)}
            message={message}
            onMessage={setMessage}
            onAdd={addComment}
            onRemove={(id) => setAnnotations((a) => a.filter((x) => x.id !== id))}
            onLocate={locate}
            onSend={(d) => void send(d)}
            sending={sending}
            error={sendError}
            composerRef={composerRef}
          />
        )}
      </div>
    </div>
  )
}

export default function App() {
  // ask the dev server for the shared file first, so the first paint already shows it
  const [boot, setBoot] = useState<{ snapshot: DocSnapshot | null } | null>(null)
  useEffect(() => {
    let mounted = true
    void loadDoc().then((snapshot) => {
      if (mounted) setBoot({ snapshot })
    })
    return () => {
      mounted = false
    }
  }, [])
  if (boot == null) return <div className="boot">Connecting…</div>
  return (
    <ReactFlowProvider>
      <Editor initial={boot.snapshot} />
    </ReactFlowProvider>
  )
}
