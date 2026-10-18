# Changelog

## 1.0.0 (not released)

The first version for users. See the [user guide](guide/README.md).

### Editor

- Shapes, text, arrows with bindings and routes, icons (Lucide, Fluent, and your own SVG folders), code blocks, images, tables, groups.
- Clean and sketch styles, four themes, a custom theme editor, smart guides and a grid, lock and hide, align, distribute, and auto layout.
- Steps with enter, exit, morph, emphasis, flow, camera, counter, and code actions; a timeline panel; scrub and play.
- Present mode with a speaker notes window.
- Audio: voiceover import and record, music, sound effects, script, automatic alignment (speech recognition in the browser), cues, captions.
- Import: Excalidraw files, Mermaid flowcharts and sequence diagrams, 10 templates in a gallery.
- Undo history with authors, autosave, the File System Access API, a command palette, shortcut help, a first-run tour, and accessibility checks (axe-core).

### Export

- MP4, WebM (with alpha), GIF, PNG, PNG and SVG of each step, captions (burned in, SRT, WebVTT), a one-file HTML player.
- CLI: also ProRes 4444 and PNG sequences.

### Agents

- Anivo Script, a CLI, and an MCP server (stdio, HTTP with a token, and live editing in the browser with a pairing code and review mode).
- An AI panel in the editor: Anthropic, OpenAI-compatible endpoints, and Ollama.

### Share and deploy

- `<anivo-player>` web component (64 KB gzip).
- Share links with end-to-end encryption and an optional server.
- Docker images for the web app and the server.
