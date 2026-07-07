# STATE

## Goal
WYSIWYG mermaid diagram editor (mermaidcharter): two-way sync between mermaid code pane and a draggable/restylable React Flow canvas, full-coverage preview.

## Now
WYSIWYG SVG export DONE + browser-verified (Emma requested positioned serialization 2026-07-07). Next: remaining verification list.

## Next
- Verify #12 selection-toolbar edits (shape/arrow/stroke/curve → canvas + text)
- Verify #13 text→canvas sync in browser
- Verify #14 gantt via mermaid-js fallback in Preview
- Verify #15 Export .mmd
- First commit once verified (repo has no commits yet; do NOT push)

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

## Done
- WYSIWYG SVG export (Emma request 2026-07-07) — RESULT: new src/lib/svgExport.ts docToSvg(doc, curves) serializes FlowDoc to standalone SVG: exact node positions, shapes via shared src/lib/shapeGeometry.ts (extracted from ShapeSvg, single source of truth for canvas + export), same edge routing rule as rfEdges (facing sides), same xyflow path helpers (linear/natural/default borderRadius 8), React Flow ArrowClosed marker markup replicated (markerUnits=strokeWidth, polyline -5,-4 0,0 -5,4 -5,-4), inlined index.css colors, subgraph boxes with SUBGRAPH_PAD, edge label chips (approx width, no DOM). App.tsx exportSvg: flowchart+doc → docToSvg; else beautiful-mermaid fallback. Verified: vitest 10/10, tsc clean, vite build green; browser: exported blob's 6 translate(x,y) byte-match layout meta positions, 5 edge paths, marker def, visual overlay matched canvas (screenshot 2026-07-07).
- Preview edge fix browser-verified — RESULT: "As arranged" draws all 5 edges (probe: 5 distinct non-degenerate path d attrs), Beautiful Mermaid toggle click-verified both directions (Chrome tab 396409991, 2026-07-07).
- Edge anchoring + routing fixed (Emma "lines not connecting properly") — RESULT: (1) handles repositioned fully inside nodes via transform overrides in App.css (React Flow anchors edges at the handle's OUTER face; default half-outside placement floated every edge 4px off the border — DOM-verified e0 start [198,106]→[198,102]=exact border). (2) All 4 ShapeNode handles now type=source + rfEdges assigns sourceHandle/targetHandle by relative node centers (facing sides); kills U-turn stubs when target sits above/left of source. Loose-mode cross-type lookup verified in @xyflow/system dist index.js:1386-91. tsc clean, vitest 5/5, vite build green. REGRESSION + FIX: all-source handles emptied the Strict-mode target array in the PREVIEW ReactFlow (which lacked connectionMode) → error008, all edges dropped (Emma 9:03 AM); fixed by adding connectionMode={ConnectionMode.Loose} to the preview instance — any RF instance rendering these nodes MUST set Loose.
- Preview default = canvas-faithful — RESULT: Preview renders read-only ReactFlow (same rfNodes/rfEdges, positions preserved) by default with "As arranged | Beautiful Mermaid" engine toggle (App.tsx PreviewEngineToggle, .preview-flow CSS). Edge-lines bug fixed: handles need `visibility:hidden` not `display:none` (display:none kills React Flow handle-bounds measurement → degenerate edge paths). Emma confirmed "they draw now"; vite build + vitest 5/5 green.
- n1-renders-boxless explained — RESULT: working as designed; "Insert text" button emits `style n1 fill:transparent,stroke:transparent` (App.tsx:627). Both canvas and beautiful-mermaid honor it.
- Node drag verified — RESULT: synthetic mousedown/mousemove/mouseup on node D moved it translate(12,236)→(147,308); position changes flow through onNodesChange; Emma built nodes live with real mouse. Original left_click_drag failure was stale pre-HMR page state, not app code.
- Edge click → toolbar bug (Emma report "lines HUD") FIXED — CAUSE: controlled edges prop with no onEdgesChange, select changes dropped. Added selectedEdgeIds state + onEdgesChange (App.tsx), selected flag in rfEdges. Verified: Emma confirmed toolbar appears, screenshot 2026-07-07 8:28AM. tsc clean.

## Open items
- Leftover verification overlay div (#mc-export-check) on Emma's open localhost:5173 page — extension disconnected before cleanup; a page refresh clears it.
- Exported-SVG edge label chip width is approximated (7.2px/char) — no text measurement outside a DOM; long labels may overflow the chip slightly.

## Failed attempts
(none open)
