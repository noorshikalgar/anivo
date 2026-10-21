# 04 — Features

## Priority labels

| Label | Meaning |
|---|---|
| **P0** | Must be in the MVP (roadmap phase 1 or 2). |
| **P1** | Must be in version 1.0. |
| **P2** | After version 1.0. Keep the design open for it. |

Each feature has an identifier. Each acceptance criterion (AC) is a test that passes or fails.
"Available to agents" means an operation, a CLI command, or an MCP tool does the same thing.
All features must be available to agents unless the table says "UI only".

---

## 1. Canvas and drawing (`FR-CANVAS`)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-CANVAS-01 | Infinite canvas with pan and zoom (10% to 3000%) | P0 | Pan with Space+drag, middle mouse, and two-finger trackpad. Zoom with Ctrl/Cmd+wheel and pinch. |
| FR-CANVAS-02 | Shapes: rectangle, ellipse, diamond, line | P0 | Each shape has fill, stroke color, stroke width, stroke style (`solid`, `dashed`, `dotted`), corner radius (rectangle only), opacity. |
| FR-CANVAS-03 | Text element and text inside a shape | P0 | Double-click a shape to add a label. The label stays centered when the shape changes size. Text wraps to the shape width. |
| FR-CANVAS-04 | Connectors: straight, elbow, curved | P0 | Arrowhead options at each end: none, arrow, triangle, dot, bar. A connector can have a label at its midpoint. |
| FR-CANVAS-05 | Binding of connector ends to elements | P0 | If a bound element moves, the connector updates in the same frame. The binding survives copy and paste of both elements. |
| FR-CANVAS-06 | Groups | P0 | Ctrl/Cmd+G groups. Ctrl/Cmd+Shift+G ungroups. A group can be a target of an action. |
| FR-CANVAS-07 | Selection, multi-select, marquee select, align, distribute | P0 | Align left, center, right, top, middle, bottom. Distribute horizontal and vertical. |
| FR-CANVAS-08 | Snap to grid and smart guides | P0 | Grid size 8 px by default. Guides show at edges and centers of near elements. A guide wins over the grid on its axis. Alt turns off both. |
| FR-CANVAS-09 | Undo and redo | P0 | Undo removes one transaction. 200 transactions of history minimum. |
| FR-CANVAS-10 | Copy, paste, duplicate. Paste of SVG and PNG from the clipboard | P0 | Pasted SVG is sanitized (see [12](12-quality-and-security.md)). |
| FR-CANVAS-11 | Icon library with search | P0 | Search by name and tag. Only free open-source packs. Packs at MVP: Lucide (ISC, default) and Fluent System Icons (MIT). The icon picker has a pack selector. The scene setting `defaultIconPack` selects the pack for new icons. P1 optional packs: Tabler (MIT), Simple Icons (CC0), Kubernetes community icons (CC BY 4.0, with attribution). No vendor packs with restrictive terms (see [12](12-quality-and-security.md#third-party-assets)). |
| FR-CANVAS-12 | Code block element | P1 | Syntax colors for 10 languages with the built-in highlighter ([decision 0003](decisions/0003-syntax-highlighter.md)). Line numbers on or off. |
| FR-CANVAS-13 | Image element (PNG, JPEG, SVG, WebP) | P1 | Images are stored as assets in the scene file. Maximum 20 MB for each image. |
| FR-CANVAS-14 | Freehand draw (pen) | P2 | Uses `perfect-freehand`. |
| FR-CANVAS-15 | Table element (rows and columns of text) | P1 | Needed for Example E. Each cell is a child element with a stable ID. |
| FR-CANVAS-16 | Auto layout of a selection: row, column, grid, tree, layered graph | P1 | A built-in layered layout ([decision 0004](decisions/0004-auto-layout.md)). One undo removes the full layout. |
| FR-CANVAS-17 | Element ID editor | P0 | The user can see and change the ID of an element. IDs are unique in a scene. Agents use these IDs. |
| FR-CANVAS-18 | Element lock and hide in the editor | P1 | A locked element cannot be selected on the canvas. Hidden in editor does not mean hidden in video. |

## 2. Style and theme (`FR-STYLE`)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-STYLE-01 | Scene style `sketch` or `clean` | P0 | One setting changes all elements. `sketch` uses Rough.js with a fixed seed for each element. The same seed gives the same lines in each render. |
| FR-STYLE-02 | Themes: color sets and fonts | P0 | Minimum 4 built-in themes at MVP (2 light, 2 dark). |
| FR-STYLE-03 | Custom theme editor | P1 | Save as JSON. Import and export a theme file. |
| FR-STYLE-04 | Per-element style override | P0 | An element can override the theme color. |
| FR-STYLE-05 | Background: solid color, grid, dots, transparent | P0 | Transparent background is available for export with alpha. |
| FR-STYLE-08 | Pop-out looks: shadows, gradients, icon badges, bold themes | P2 | Done: style `shadow` (soft, hard, glow) and `shadowColor`, `gradient` (fill fades top to bottom), icon `fill` draws a badge circle, themes `pop-light` (neo-brutalist) and `neon-dark` (glow). The SVG export draws the same (layers, not canvas shadows). |

## 3. Steps and animation (`FR-STEP`)

See [06 — Animation engine](06-animation-engine.md) for the full model.

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-STEP-01 | Step list panel: add, remove, rename, reorder, duplicate | P0 | Reorder with drag. The canvas shows the end state of the selected step. |
| FR-STEP-02 | Enter effects: `fade`, `pop`, `draw-on`, `slide` (4 directions), `wipe`, `typewriter`, `scale` | P0 | `draw-on` draws the stroke along its path, then fades in the fill. `typewriter` shows text one character at a time. |
| FR-STEP-03 | Exit effects: the reverse of each enter effect | P0 | |
| FR-STEP-04 | Morph: automatic transition of changed properties between steps | P0 | Position, size, rotation, colors, opacity, stroke width, corner radius, and text change smoothly. Text changes use a crossfade. |
| FR-STEP-05 | Emphasis effects: `pulse`, `shake`, `glow`, `flash`, `wiggle`, `highlight`, `focus` (dim all other elements) | P0 | An emphasis does not change the state after the action ends. |
| FR-STEP-06 | Flow on connectors | P0 | Options: particle shape, color, size, speed, count, spacing, direction, round-robin across a list of connectors, loop until the step ends. Done: dot, square, pill, an icon (`icon=lucide:mail`), or an image or SVG asset; a stream, one particle (`once`), or a number (`count=`); a trail; turn along the arrow (`orient`). The step panel shows all options. |
| FR-STEP-07 | Camera actions: `zoom-to` an element or a bound, `pan`, `reset` | P1 | The camera never shows an area outside the scene bounds unless the user allows it. |
| FR-STEP-08 | Counter action on a text element | P1 | Counts from a number to a number with a format, for example `{n} req/s`. |
| FR-STEP-09 | Code actions: highlight lines, type lines, show a diff | P1 | |
| FR-STEP-10 | Timing for each action: delay, duration, easing, stagger | P0 | Default timing is automatic. The user can override each value. |
| FR-STEP-11 | Easing presets: `linear`, `ease-in`, `ease-out`, `ease-in-out`, `spring-soft`, `spring-bouncy`, `back-out`, custom cubic Bézier | P0 | Default easing is `ease-out` for enter and `ease-in-out` for morph. |
| FR-STEP-12 | Step trigger: `auto` (after the previous step), `click` (present mode), `cue` (voiceover time) | P0 (`auto`, `click`), P1 (`cue`) | |
| FR-STEP-13 | Scrub the playhead | P0 | Each playhead position shows the correct frame. Scrub does not depend on play history. |
| FR-STEP-14 | Path morph between different shape types | P2 | Done: morph `shape` (rectangle, ellipse, diamond); both outlines resample to 96 points. Script: `morph a shape=ellipse`. Inspector: "Shape in this step". |
| FR-STEP-15 | Motion path: move an element along a drawn path | P2 | Done: `motion` action (points, curve, orient). Editor: Actions › Send (or Add action › Send along the selected arrow). Script: `move a path="x,y x,y …" [curve] [orient]`, or `move a along=<arrow> [back]` (follows the arrow route, also when the arrow moves; default 1.6 s). |
| FR-STEP-19 | Step caption: one sentence for each step, next to the element that changes | P1 | Done (docs/17 P4). Actions tab › Caption, with Next to and Side. It types in, the step holds 0.4 s for each word (minimum 2 s), and it fades out in the next step. Script: `step "T" caption="…" near=id side=below`. |
| FR-STEP-16 | Hold: a step can hold the last state for a duration | P0 | |
| FR-STEP-17 | Timeline panel with tracks for each action | P1 | Drag action edges to change delay and duration. UI only for drag. Operations exist for the same change. |
| FR-STEP-18 | Own delay for each element of an action | P2 | Done: **Split per element** in the action editor (enter, exit, morph, emphasis, move) makes one action for each target. The stagger becomes the delay of each new action, so the timing does not change. Agents: `action.remove` and `action.add`, or one script line for each element. |

## 4. Audio and captions (`FR-AUDIO`)

See [08 — Audio and captions](08-audio-and-captions.md).

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-AUDIO-01 | Import a voiceover: MP3, WAV, M4A, OGG | P1 | Shows a waveform. Maximum 30 minutes. |
| FR-AUDIO-02 | Cues: link a step start to a voiceover time | P1 | Drag a cue on the waveform. The step start moves with it. |
| FR-AUDIO-03 | Script: paste text, one line for each step | P1 | |
| FR-AUDIO-04 | Automatic alignment of script lines to the voiceover | P1 | Uses speech recognition with word times. If a line has no match, show it in amber and keep the old cue. |
| FR-AUDIO-05 | Background music track with volume | P1 | |
| FR-AUDIO-06 | Volume ducking of music under speech | P2 | Done: `duckDb` on music and sound tracks (docs/08 "Ducking"). |
| FR-AUDIO-07 | Record a voiceover in the app with the microphone | P1 | |
| FR-AUDIO-11 | Record the voiceover step by step: one take for each step, record a step again, the step fits the voice | P2 | Done: Audio › Record voiceover step by step, `anivo audio take`, and `anivo audio fit`. docs/08 "Record step by step". |
| FR-AUDIO-08 | Text to speech provider (plugin) | P2 | Done: Audio › Make voiceover from script. An OpenAI-compatible `/audio/speech` service (cloud with the user's key, or a local Piper or Kokoro server with the same API). Each step gets a cue at the start of its line. |
| FR-AUDIO-09 | Captions: show in the video and export SRT and WebVTT | P1 | Caption text comes from the script lines. Caption times come from the cues. |
| FR-AUDIO-10 | Sound effects on actions (whoosh, click, pop) | P2 | Done: `sound` (pop, click, whoosh, ding, thud, tick, blip, chime, rise, bubble, success, error; and keys and ticks, which repeat for the whole action) and `soundGainDb` on each action. The editor plays a sound when you choose it. The sounds are synthesized (no sound files). Script: `enter a pop sound=pop`. |

## 5. Export (`FR-EXPORT`)

See [07 — Rendering and export](07-rendering-and-export.md).

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-EXPORT-01 | MP4 (H.264 + AAC) | P0 | 720p, 1080p, 1440p, 2160p. 24, 30, 60 fps. |
| FR-EXPORT-02 | WebM (VP9 + Opus), with alpha | P0 | Transparent background works in DaVinci Resolve and Premiere. |
| FR-EXPORT-03 | GIF | P0 | Width option. Frame rate option (10 to 30 fps). Size estimate before export. |
| FR-EXPORT-04 | PNG of one frame. PNG sequence | P0 | |
| FR-EXPORT-05 | ProRes 4444 with alpha | P1 | CLI only in 1.0 (needs FFmpeg). Desktop app after phase 6. |
| FR-EXPORT-06 | Aspect ratios: 16:9, 9:16, 1:1, 4:5, custom | P0 | The camera bounds follow the aspect ratio. |
| FR-EXPORT-07 | SRT and WebVTT captions | P1 | |
| FR-EXPORT-08 | Self-contained HTML player file | P1 | One HTML file plays the scene with no network. |
| FR-EXPORT-09 | Animated SVG | P2 | |
| FR-EXPORT-10 | Lottie JSON | P2 | |
| FR-EXPORT-11 | Export a range of steps | P0 | Example: steps 3 to 5 only. |
| FR-EXPORT-12 | Export progress and cancel | P0 | Shows a percentage and the time remaining. Cancel stops in less than 1 second. |
| FR-EXPORT-13 | Static export: SVG and PNG of the end state of each step | P0 | Useful for docs and slides. |

## 6. Files and storage (`FR-FILE`)

See [05 — Scene model](05-scene-model.md).

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-FILE-01 | Save and open `.anivo` (ZIP) and `.anivo.json` (single JSON with embedded assets) | P0 | |
| FR-FILE-02 | Folder format for Git: `scene.json` + `assets/` | P1 | JSON has a stable key order and 2-space indent. A change of one label changes one line. |
| FR-FILE-03 | Autosave in the browser (IndexedDB) | P0 | Autosave occurs 1 second after the last change. Recover after a browser crash. Each scene has its own entry in the scene library (`apps/web/src/library.ts`). |
| FR-FILE-04 | File System Access API in Chromium browsers | P0 | Save to the same file with Ctrl/Cmd+S. Other browsers download the file. |
| FR-FILE-05 | Import Excalidraw files (`.excalidraw`) | P1 | Shapes, text, connectors, bindings, and groups convert. Excalidraw frames convert to groups. |
| FR-FILE-06 | Import Mermaid flowchart and sequence diagram text | P1 | |
| FR-FILE-07 | Schema version and migrations | P0 | Each file has `schemaVersion`. Anivo opens all older versions. |
| FR-FILE-08 | Templates gallery (built-in) | P1 | Minimum 10 templates at 1.0. Examples A to E are templates. The list is in `packages/schema/src/templates.ts`; the sources are in `scripts/build-templates.ts` and `scripts/templates/`. |
| FR-FILE-09 | Recent scenes list | P0 | Done: the home screen (start screen) shows the scene library: thumbnail, name, size, steps, length, and last change. Search, sort, rename, duplicate, download, and delete. New blank scene (16:9, 9:16, 1:1), templates, open file, import, and drop an `.anivo` file. The **Anivo** button in the editor goes back to the home screen. |

## 7. Agent and AI (`FR-AGENT`)

See [09 — Agent interface](09-agent-interface.md).

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-AGENT-01 | Operation bus with a published operation schema | P0 | Each operation has a JSON Schema. Invalid operations return an error with a path and a fix hint. |
| FR-AGENT-02 | Anivo Script parser and printer | P0 | `print(parse(text))` equals the normalized text. `parse(print(scene))` equals the scene. |
| FR-AGENT-03 | CLI: `render`, `export`, `preview`, `lint`, `convert`, `validate`, `schema`, `mcp`, `serve` | P0 | |
| FR-AGENT-04 | MCP server over stdio | P0 | Works with Claude Code, Claude Desktop, and other MCP clients. |
| FR-AGENT-05 | Preview tool returns a PNG image | P0 | Default 960 × 540. The image has element IDs drawn as small labels when `debug` is on. |
| FR-AGENT-06 | Lint tool | P0 | Finds overlap, text overflow, element off camera, low contrast, connector crosses a shape, unused element, step with no action. |
| FR-AGENT-07 | Relative placement operations | P0 | `place` with `rightOf`, `below`, `gap`, `align`. Agents do not need pixel coordinates. |
| FR-AGENT-08 | Bridge from the MCP server to a running editor | P1 | Web app: local WebSocket from the CLI, with a pairing code. Desktop app (phase 6): local HTTP with a token. |
| FR-AGENT-09 | Review mode for agent transactions | P1 | Accept or reject each transaction. Rejected transactions do not stay in the undo history. |
| FR-AGENT-10 | AI panel in the editor | P1 | Providers: Anthropic, OpenAI-compatible endpoint, Ollama. The user supplies the key. |
| FR-AGENT-11 | Author on each operation | P0 | The history panel shows "You" or the agent name. |
| FR-AGENT-12 | WebMCP tools in the web app (`navigator.modelContext`) | P2 | Done: the AI panel tools as `anivo_*` tools, with `registerTool` or `provideContext`. Only when the browser supports it. |
| FR-AGENT-13 | Agent eval suite | P1 | 20 fixed prompts. Score each output with lint and a rubric. Run in CI each week. |

## 8. Present and player (`FR-PLAY`)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-PLAY-01 | Present mode in the editor | P0 | Full screen. Next and previous step with keys, click, and a presenter remote. |
| FR-PLAY-02 | `<anivo-player>` web component | P1 | Attributes: `src`, `autoplay`, `loop`, `controls`, `step`. Size less than 150 KB gzip without fonts. |
| FR-PLAY-03 | Speaker notes for each step | P1 | Shows in a second window in present mode. |

## 9. Collaboration and sharing (`FR-SHARE`)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-SHARE-01 | Share link with end-to-end encryption | P1 | The key is in the URL fragment. The server stores only encrypted data. Needs the optional server. |
| FR-SHARE-02 | Real-time collaboration | P2 | Yjs. Cursors for each person and each agent. |
| FR-SHARE-03 | Comments on elements and steps | P2 | Done: `comments` in the scene file; `comment.add`, `comment.update`, `comment.remove` operations; answers, resolve; a badge on the canvas; agents see open comments in the scene summary. |

## 10. Editor quality (`FR-UX`)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-UX-01 | Keyboard shortcuts for all main actions. Shortcut help with `?` | P0 | |
| FR-UX-02 | Command palette (Ctrl/Cmd+K) | P0 | All editor commands are in the palette. |
| FR-UX-03 | Light and dark editor UI | P0 | The editor UI theme is separate from the scene theme. |
| FR-UX-04 | First-run tour, 5 screens maximum | P1 | The user can skip it. |
| FR-UX-05 | Translations of the UI | P2 | Text strings in one file for each language from the start. |
| FR-UX-06 | Touch and pen input on tablets | P2 | Partly done: two fingers zoom (pinch) and pan the canvas; one finger selects, moves, and draws. |
| FR-UX-07 | Accessibility: keyboard focus order, screen reader labels on all controls | P1 | Pass axe-core with zero critical issues. |
| FR-UX-08 | Layout for small windows (tablet and phone) | P1 | Done: at 1280 px and less the panels are narrower. Below 1024 px the canvas uses the full width, and **Steps** and **Properties** (top bar buttons) open as drawers over it (Escape closes them). Below 600 px the top bar shows icons only. The video fits the canvas again when the window size changes, until the user pans or zooms. The home screen and the dialogs fit a 375 px phone. |
| FR-UX-09 | A dense, consistent UI, as in professional tools | P1 | Done: [15 — Editor UI design](15-ui-design.md). Areas with headers (Steps tree, Viewport with a vertical toolbar, Outliner, Properties with tabs, Timeline ruler, status bar), collapsible panels, label-left property rows, drag number fields (one undo step for each drag), icon toggles, color fields, list views. |

## 11. Extensibility (`FR-EXT`)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| FR-EXT-01 | Custom icon packs from a folder of SVG files | P1 | Editor: Add icon pack in the icon picker (kept in the browser). CLI: `anivo icons add <folder>` writes `~/.anivo/icons/<pack>.json` (or `ANIVO_ICONS_DIR`); the CLI and the MCP server load these packs. Use an icon as `<pack>:<file-name>`. The HTML export includes the used icons. |
| FR-EXT-02 | Plugin API for new effects and new element types | P2 | Plugins run in a sandbox. They cannot read files or the network without permission. |
| FR-EXT-03 | Public npm packages for the engine and the renderer | P1 | Other tools can render Anivo scenes. |
