# STATE

## Goal
WYSIWYG mermaid diagram editor (Grammy, formerly mermaidcharter): two-way sync between mermaid code pane and a draggable/restylable React Flow canvas, full-coverage preview.

## Now
All verification gates passed (#12–#15 browser-verified 2026-07-07). One uncommitted change: src/App.tsx removes the lastEmitted echo-guard from onCodeChange (bug fix, see Done). Awaiting Emma's review/commit decision.

## Next
- Commit the onCodeChange fix (src/App.tsx) when Emma approves

## Decisions
- Stack: Vite + React + React Flow (Emma via AskUserQuestion 2026-07-07)
- Two-way sync code pane ⇄ canvas (Emma)
- Scope: everything mermaid renders — WYSIWYG for flowcharts, read-only preview for the rest (Emma)
- Renderer: beautiful-mermaid for parse + SVG preview of its 6 types; mermaid-js fallback for other types (ASSUMPTION, hybrid)
- Toolbar UX modeled on Mermaid Chart whiteboard screenshot incl. Auto-Layout toggle (Emma screenshot 2026-07-07)

## Constraints
- use beautiful mermaid in order to render/preview (Emma, 2026-07-07) — REVISED by: "we can offer beautiful mermaid as a rendering engine, but let's assume by default that it renders in the same way the live chart is displayed and positioned" (Emma, 2026-07-07)

## Facts
- dev server: http://localhost:5173 (bg task b0bufb3zc); Chrome tab 396409891
- tests: `npx vitest run` (10 pass); build: `npx vite build`
- beautiful-mermaid parser drops `--o --x o--o x--x ~~~` edges silently
- layout meta comment: `%% mc:layout {json}` last line of doc
- remote: https://github.com/emmahyde/mermaidcharter (private); first commit 99a36a6 on main, pushed 2026-07-07 (Emma: "commit + push"); .serena/ gitignored

## Done
- #12 selection-toolbar edits browser-verified — RESULT: node A → Hexagon updated canvas + text (`A{{Start}}`) + localStorage; edge A→B → Dotted updated canvas dash + text (`A -.-> B`). Test residue reverted afterward via CM dispatch (doc back to `A[Start]` / `A --> B`, layout meta intact).
- #13 text→canvas sync browser-verified + BUG FIXED — CAUSE: onCodeChange guard `if (text === lastEmitted.current) return` (App.tsx) swallowed genuine user edits restoring the last canvas-emitted string (e.g. deletion-only edits). FIX: removed lastEmitted entirely — @uiw/react-codemirror never fires onChange for prop-driven external updates (ExternalChange annotation, useCodeMirror.js:93-97,202), so every onChange is a real user edit. Verified: `npx vitest run` → 10/10 pass, tsc clean; browser: CM dispatch delete → cm/localStorage/canvas consistent. UNCOMMITTED in src/App.tsx.
- #14 gantt via mermaid-js fallback browser-verified — RESULT: gantt doc in code pane → Preview renders full chart (title, sections, bars, milestone diamond, today marker). beautiful-mermaid doesn't support gantt, so this exercises the fallback path.
- #15 Export .mmd browser-verified — RESULT: download-intercept probe (patched URL.createObjectURL + anchor click): filename diagram.mmd, type text/plain, blob byte-matches editor text (matchesEditor:true, 228 bytes).
- 0-edges-in-automation-tab CLOSED as environment artifact, not app bug — RESULT: probe showed nodesInitialized:false, measured:{}, handleBounds:null with document.visibilityState 'hidden'; hidden-tab throttling stalls React Flow's ResizeObserver/rAF measurement so all edges drop. Activating the tab (screenshot) → all 5 edges render. Emma's foreground tab was always fine ("arrows look fine to me").
- WYSIWYG SVG export (Emma request 2026-07-07) — RESULT: new src/lib/svgExport.ts docToSvg(doc, curves) serializes FlowDoc to standalone SVG: exact node positions, shapes via shared src/lib/shapeGeometry.ts (extracted from ShapeSvg, single source of truth for canvas + export), same edge routing rule as rfEdges (facing sides), same xyflow path helpers (linear/natural/default borderRadius 8), React Flow ArrowClosed marker markup replicated (markerUnits=strokeWidth, polyline -5,-4 0,0 -5,4 -5,-4), inlined index.css colors, subgraph boxes with SUBGRAPH_PAD, edge label chips (approx width, no DOM). App.tsx exportSvg: flowchart+doc → docToSvg; else beautiful-mermaid fallback. Verified: vitest 10/10, tsc clean, vite build green; browser: exported blob's 6 translate(x,y) byte-match layout meta positions, 5 edge paths, marker def, visual overlay matched canvas (screenshot 2026-07-07).
- Preview edge fix browser-verified — RESULT: "As arranged" draws all 5 edges (probe: 5 distinct non-degenerate path d attrs), Beautiful Mermaid toggle click-verified both directions (Chrome tab 396409991, 2026-07-07).
- Edge anchoring + routing fixed (Emma "lines not connecting properly") — RESULT: (1) handles repositioned fully inside nodes via transform overrides in App.css (React Flow anchors edges at the handle's OUTER face; default half-outside placement floated every edge 4px off the border — DOM-verified e0 start [198,106]→[198,102]=exact border). (2) All 4 ShapeNode handles now type=source + rfEdges assigns sourceHandle/targetHandle by relative node centers (facing sides); kills U-turn stubs when target sits above/left of source. Loose-mode cross-type lookup verified in @xyflow/system dist index.js:1386-91. tsc clean, vitest 5/5, vite build green. REGRESSION + FIX: all-source handles emptied the Strict-mode target array in the PREVIEW ReactFlow (which lacked connectionMode) → error008, all edges dropped (Emma 9:03 AM); fixed by adding connectionMode={ConnectionMode.Loose} to the preview instance — any RF instance rendering these nodes MUST set Loose.
- Preview default = canvas-faithful — RESULT: Preview renders read-only ReactFlow (same rfNodes/rfEdges, positions preserved) by default with "As arranged | Beautiful Mermaid" engine toggle (App.tsx PreviewEngineToggle, .preview-flow CSS). Edge-lines bug fixed: handles need `visibility:hidden` not `display:none` (display:none kills React Flow handle-bounds measurement → degenerate edge paths). Emma confirmed "they draw now"; vite build + vitest 5/5 green.
- n1-renders-boxless explained — RESULT: working as designed; "Insert text" button emits `style n1 fill:transparent,stroke:transparent` (App.tsx:627). Both canvas and beautiful-mermaid honor it.
- Node drag verified — RESULT: synthetic mousedown/mousemove/mouseup on node D moved it translate(12,236)→(147,308); position changes flow through onNodesChange; Emma built nodes live with real mouse. Original left_click_drag failure was stale pre-HMR page state, not app code.
- Edge click → toolbar bug (Emma report "lines HUD") FIXED — CAUSE: controlled edges prop with no onEdgesChange, select changes dropped. Added selectedEdgeIds state + onEdgesChange (App.tsx), selected flag in rfEdges. Verified: Emma confirmed toolbar appears, screenshot 2026-07-07 8:28AM. tsc clean.

## Open items
- Leftover verification overlay div (#mc-export-check) on Emma's open localhost:5173 page — extension disconnected before cleanup; a page refresh clears it.
- dev server bg task br4ize98n (restarted 2026-07-07 after killing wedged vite PID via lsof); still running.
- Exported-SVG edge label chip width is approximated (7.2px/char) — no text measurement outside a DOM; long labels may overflow the chip slightly.

## Failed attempts
(none open)
