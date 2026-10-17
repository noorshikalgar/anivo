# 10 — Architecture

## Layer rule

The core of Anivo has no UI, no DOM, and no Node-only code. The core runs in a browser, in Node, in a Web Worker, and in Electron with no change.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Apps        web (Vite SPA/PWA)   desktop (Electron)   server (optional)  │
├──────────────────────────────────────────────────────────────────────────┤
│ Surfaces    editor (React UI)    cli    mcp    player (web component)    │
├──────────────────────────────────────────────────────────────────────────┤
│ Services    export-web   export-node   audio   ai   bridge   fileio      │
├──────────────────────────────────────────────────────────────────────────┤
│ Core        schema   ops   engine   layout   render   script   lint      │
│             (pure TypeScript, isomorphic, no I/O)                        │
└──────────────────────────────────────────────────────────────────────────┘
```

A package can import only from its own layer or a lower layer. A lint rule (`eslint-plugin-boundaries`) enforces this.

## Packages (pnpm monorepo)

| Package | Layer | Purpose | Main dependencies |
|---|---|---|---|
| `@anivo/schema` | Core | Zod schemas, types, defaults, migrations, JSON Schema generation | `zod` |
| `@anivo/ops` | Core | Operation bus, validation, apply, history, transactions, ID generation | `@anivo/schema`, `fractional-indexing` |
| `@anivo/engine` | Core | `resolveTimeline`, `evaluate`, easing, effects, flow, camera | `@anivo/schema` |
| `@anivo/layout` | Core | Connector routing, text layout, relative placement, auto layout | `elkjs`, font metrics |
| `@anivo/render` | Core | Canvas 2D renderer, styles (`clean`, `sketch`), icons, SVG writer | `roughjs` |
| `@anivo/script` | Core | Anivo Script lexer, parser, compiler, printer | — |
| `@anivo/lint` | Core | Lint rules | `@anivo/engine`, `@anivo/layout` |
| `@anivo/fileio` | Services | `.anivo` ZIP, `.anivo.json`, folder format, Excalidraw and Mermaid import | `fflate` |
| `@anivo/export-web` | Services | WebCodecs encode, Mediabunny mux, GIF encode | `mediabunny`, `gifenc` |
| `@anivo/export-node` | Services | `@napi-rs/canvas` render, FFmpeg process | `@napi-rs/canvas` |
| `@anivo/audio` | Services | Decode, peaks, mix, alignment, Whisper adapters | `@huggingface/transformers` (web) |
| `@anivo/ai` | Services | Provider adapters (Anthropic, OpenAI-compatible, Ollama), tool loop | `@anthropic-ai/sdk` |
| `@anivo/bridge` | Services | Bridge protocol, pairing, token checks | `ws` (Node side) |
| `@anivo/editor` | Surfaces | React editor UI | `react`, `zustand`, `@fluentui/react-components` |
| `@anivo/cli` | Surfaces | `anivo` command | `commander` |
| `@anivo/mcp` | Surfaces | MCP server | `@modelcontextprotocol/sdk` |
| `@anivo/player` | Surfaces | `<anivo-player>` web component | Core only |
| `apps/web` | Apps | Web app shell, PWA, Docker image | `vite`, `vite-plugin-pwa` |
| `apps/desktop` | Apps | Electron shell | `electron`, `electron-builder` |
| `apps/server` | Apps | Share links, collaboration relay, render queue | `fastify`, `y-websocket` (P2) |
| `apps/docs` | Apps | Documentation site and examples | `astro` (Starlight) |

## Main data flow in the editor

1. The user drags an element.
2. The canvas controller sends a **preview** change to a transient layer. It does not send an operation on each pointer move.
3. On pointer up, the controller sends one transaction to the operation bus.
4. The bus validates and applies the transaction. It returns a new immutable `Scene`.
5. The store keeps the new scene. React panels that read changed data render again.
6. The canvas render loop calls `evaluate(scene, playhead)` and draws on the next animation frame.
7. Autosave writes the scene 1 second after the last transaction.
8. The bridge sends the transaction to connected agents as an event.

> **CAUTION:** Do not store the scene in React state with deep copies. Use structural sharing (immutable updates with Immer or hand-written spreads). The render loop compares references to skip work.

## State management

| State | Owner | Notes |
|---|---|---|
| Scene | Operation bus (one per open scene) | Immutable. Version number increases for each transaction |
| History | Operation bus | Inverse operations for each transaction |
| Selection, tool, zoom, panel layout | Editor store (Zustand) | Not in the scene file. Not in undo history |
| Playhead, play state | Player controller | Not in the scene file |
| Pending agent transactions | Review queue | Not applied until accepted |

### Undo

1. Each operation has an inverse function: `invert(op, sceneBefore) → op[]`.
2. A transaction stores its inverse operations.
3. Undo applies the inverse as a new transaction with `author.kind = "undo"`.
4. This keeps undo correct when an agent and a person edit the same scene.

## Collaboration design (P2, prepare now)

- The element map, the step array, and the action arrays map to Yjs types (`Y.Map`, `Y.Array`).
- Operations stay the public API. The bus applies operations to the Yjs document. Yjs syncs the document.
- Agents and people are peers. Each peer has an awareness state (cursor, selection, name).

> **NOTE:** Keep all IDs as strings, all orders as fractional indexes, and no derived data in the scene. These three rules make the later Yjs move simple.

## Rendering in a worker

- The editor renders on the main thread in v1 (simpler input handling).
- Export renders in a Web Worker with `OffscreenCanvas`. The UI stays responsive during export.
- The worker gets the scene as a structured clone, and it loads its own fonts.

## Technology stack

| Area | Choice | Reason |
|---|---|---|
| Language | TypeScript 5, strict mode | One language for all layers |
| Package manager | pnpm workspaces | Fast, strict dependency rules |
| Build | Vite (apps), tsup (packages) | |
| UI | React 19 + **Fluent UI React v9** (`@fluentui/react-components`, `@fluentui/react-icons`) | Professional, accessible, keyboard-ready components. Same kit as the BoxTrace project. See [Editor UI kit](#editor-ui-kit) |
| State | Zustand for editor UI state | Small, no boilerplate |
| Canvas | Canvas 2D, Rough.js | See [07](07-rendering-and-export.md) |
| Layout | ELK.js | Layered graph layout for agents |
| Code colors | Shiki | Same colors as VS Code themes |
| Validation | Zod 4 | Types and JSON Schema from one source |
| Video (web) | WebCodecs + Mediabunny | No WASM, fast |
| Video (Node) | FFmpeg (bundled with `ffmpeg-static` in the CLI) | All formats |
| Node canvas | `@napi-rs/canvas` | Skia, prebuilt binaries, no system dependencies |
| Speech | Transformers.js Whisper (web), whisper.cpp (desktop, CLI) | Local first |
| MCP | `@modelcontextprotocol/sdk` | Official SDK |
| Desktop | Electron | See [11](11-distribution.md) |
| Tests | Vitest, Playwright, pixelmatch | |
| Docs | Astro Starlight | |
| CI | GitHub Actions | Build, test, release for 3 OS |

## Editor UI kit

Decision: use **Fluent UI React v9** for all editor UI (panels, menus, dialogs, toolbars, inputs).

1. Wrap the editor in one `FluentProvider`. Use `webLightTheme` and `webDarkTheme` as the base. Make a Anivo brand theme with `createLightTheme` and `createDarkTheme` from one brand color ramp.
2. Style custom parts with Griffel (`makeStyles`) and Fluent tokens (`tokens.colorNeutralBackground1`, `tokens.spacingHorizontalM`). Do not hard-code colors in editor UI.
3. Use Fluent icons (`@fluentui/react-icons`, MIT) for editor UI icons. They match the Fluent controls. Import each icon by name, so the bundle includes only the used icons.
4. Scene icons are a separate choice. The user selects a pack in the icon picker: Lucide (default) or Fluent System Icons. Both are bundled. See FR-CANVAS-11.
5. Do not mix a second component kit. If Fluent has no component for a need, build it from Fluent tokens and primitives.
6. Use Fluent components for: `Toolbar`, `Menu`, `Dialog`, `Popover`, `Tooltip`, `Slider`, `SpinButton`, `Dropdown`, `Combobox`, `Field`, `Input`, `Switch`, `TabList`, `Tree` (step list and layers), `Toast`, `MessageBar`, `DataGrid`, `Drawer` (side panels), `Card` (templates gallery).
7. Color picker: use the Fluent `ColorPicker` package if it is stable at phase 1 start. If not, build one from Fluent primitives.
8. Lazy-load heavy panels (timeline, AI panel, export dialog, templates gallery) to keep the initial JS budget.

> **CAUTION:** Do not use CSS `zoom` to scale the editor UI. CSS zoom puts Fluent popovers and menus in the wrong position (found in the BoxTrace project). Scale text through theme tokens instead.

> **NOTE:** The Fluent theme is the **editor UI theme** only. It is not the scene theme. Scene colors come from Anivo scene themes and the renderer (see [01](01-glossary.md)). The canvas never uses Fluent styles.

## Directory layout

```
anivo/
├── apps/
│   ├── web/
│   ├── desktop/
│   ├── server/
│   └── docs/
├── packages/
│   ├── schema/  ops/  engine/  layout/  render/  script/  lint/
│   ├── fileio/  export-web/  export-node/  audio/  ai/  bridge/
│   └── editor/  cli/  mcp/  player/
├── assets/
│   ├── fonts/
│   ├── icons/          # one JSON file per pack
│   └── templates/      # Examples A–E and more, as .anivo.json
├── evals/              # agent eval prompts, rubric, results
├── tests/
│   └── golden/         # expected PNG frames
├── docs/               # these planning documents
├── prompts/
├── docker/
│   ├── Dockerfile
│   └── compose.yaml
└── CLAUDE.md
```
