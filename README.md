# Grammy

A WYSIWYG editor for [Mermaid](https://mermaid.js.org) diagrams — edit the diagram by dragging nodes on a canvas, edit the Mermaid source in a code pane, and keep both in sync in either direction.

## Overview

Grammy pairs a two-way canvas ([@xyflow/react](https://reactflow.dev)) with a Mermaid source editor ([CodeMirror](https://codemirror.net) via `@uiw/react-codemirror`):

- **Canvas → code**: drag a node, restyle a shape, or change an edge style in the toolbar, and the underlying `.mmd` text updates to match.
- **Code → canvas**: type or paste Mermaid source in the code pane and the canvas re-renders and re-lays-out live.
- **Parsing/rendering**: [`beautiful-mermaid`](https://www.npmjs.com/package/beautiful-mermaid) parses Mermaid text into a typed graph and drives the canvas; diagram types it doesn't support (e.g. Gantt) fall back to [`mermaid`](https://www.npmjs.com/package/mermaid) for preview rendering.
- **Layout**: automatic layout via [`elkjs`](https://github.com/kieler/elkjs), with node positions/curve choices persisted in a `%% mc:layout {json}` comment appended to the diagram source, so manual positioning round-trips through the text.
- **Export**: download the diagram as a `.mmd` file.

Source layout:

```
src/
  App.tsx              # top-level state: source text <-> parsed graph <-> canvas
  components/
    CodePane.tsx        # CodeMirror-backed Mermaid source editor
    Preview.tsx          # mermaid-js fallback renderer (unsupported diagram types)
    ShapeNode.tsx         # canvas node renderer
    FlowEdge.tsx           # canvas edge renderer
    Toolbar.tsx              # shape/edge/arrowhead/animation controls
    SelectionToolbar.tsx      # per-node/edge inline restyle controls
  lib/
    parse.ts             # Mermaid text -> graph model
    serialize.ts           # graph model -> Mermaid text
    layout.ts               # elkjs auto-layout
    model.ts                 # shared graph/node/edge types
    shapeGeometry.ts          # node shape -> SVG geometry
    svgExport.ts               # diagram export
```

## Quick start

Requires Node 18+.

```bash
git clone https://github.com/emmahyde/grammy.git
cd grammy
npm install
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`) in a browser.

### Other scripts

```bash
npm run build     # tsc -b && vite build — type-check then production build
npm run preview   # serve the production build locally
npm run lint       # oxlint
npx vitest run      # run the test suite
```

## Design with an agent

`npm run dev` also turns Grammy into a shared design surface. You work in the browser. A coding agent works in `design.mmd`. Each side sees the other's changes live.

```
 browser (you)  <── events ──  dev server  ── watches ──>  design.mmd  <── edits ──  agent
      │                            │                                                   ▲
      └── comments, approve ──>  .grammy/inbox  ──────────  npm run wait  ─────────────┘
```

### Files

| File | Holds | Who edits it |
|---|---|---|
| `design.mmd` | The diagram, as plain Mermaid | You (canvas or code pane) and the agent |
| `design.layout.json` | Node positions and curve choices | The surface only. Agents must not edit it. |
| `.grammy/` | Unread feedback and "agent is listening" state | The surface and `npm run wait`. Not committed. |

Positions live apart from the diagram. When you drag a node, `design.mmd` does not change. The agent's exact-match edits do not go stale.

Set `GRAMMY_FILE=path/to/other.mmd` to design a different file.

### Your side

1. Start the app: `npm run dev`. The **Collab** panel shows whether an agent is listening.
2. Write an **overall note** to set the direction. Select a node or edge and add a **comment** (tag it `question`, `blocking`, `nit` or `idea`). Press `C` to jump to the comment box and `⌘↵` to add it.
3. Press **Send to agent**, or **Approve** when the diagram is right.
4. When the agent edits `design.mmd`, the canvas updates. New and changed items glow for a few seconds.

If the agent edits the file while you have unsaved changes, a banner asks you to keep yours or take theirs. Nothing is overwritten until you choose.

### The agent's side

Run `npm run wait`. It blocks until you send feedback, then prints one `<diagram-feedback>` block to stdout and exits. The block names exactly which nodes and edges may change, with the lines of `design.mmd` that mention them. Edit `design.mmd`, then run `npm run wait` again.

```bash
npm run wait                    # wait with no limit
npm run wait -- --timeout 600   # exit with code 2 after 600 seconds
```

Without a dev server (for example `npm run preview`), the editor works as before. The Collab panel shows "Not linked" and sending is off.
