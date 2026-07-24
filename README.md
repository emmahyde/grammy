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
