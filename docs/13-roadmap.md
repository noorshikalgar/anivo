# 13 — Roadmap

## Rules

1. Do the phases in sequence. Do not start a phase before the exit gate of the previous phase passes.
2. Each phase ends with a demo video made with Anivo itself.
3. If a phase is more than 50% over its time estimate, stop. Write down the cause. Cut scope before you continue.
4. Time estimates assume one developer with an AI coding agent, part-time (approximately 20 hours each week).

## Phase 0 — Spike (2 weeks)

**Goal:** Prove the hard parts before the UI exists.

1. Write `@anivo/schema` with the minimum types: rectangle, text, connector, step, `enter`, `morph`, `flow`.
2. Write `resolveTimeline` and `evaluate`.
3. Write a `clean` renderer and a `sketch` renderer for these types.
4. Render Example A steps 1 to 4 to PNG frames in Node.
5. Export Example A to MP4 in Node with FFmpeg.
6. Export the same scene to MP4 in Chrome with WebCodecs.
7. Compare frames from both engines.

**Exit gate:**

- [x] Example A, steps 1 to 4, exports to MP4 in Node and in Chrome.
- [x] Browser and Node frames differ by less than 0.5% of pixels. (Measured: 0.09% clean, 0.17% sketch.)
- [x] Scrub to a random time gives the same frame as sequential play (100 random times).
- [x] Decision record for the hand-drawn font ([0001](decisions/0001-sketch-font.md)).

**Status: passed on 2026-10-17.** Demo: `pnpm render:template load-balancer out.mp4 sketch` (10.3 s of 1080p60 video renders in approximately 4.5 s on Apple Silicon).

## Phase 1 — MVP editor (8 weeks)

**Goal:** A person makes and exports a video in the web app.

Scope: FR-CANVAS 01–11, 17. FR-STYLE 01, 02, 04, 05. FR-STEP 01–06, 10–13, 16. FR-EXPORT 01–04, 06, 11–13. FR-FILE 01, 03, 04, 07, 09. FR-AGENT 01, 11. FR-PLAY 01. FR-UX 01–03.

1. Operation bus with undo and redo.
2. Canvas with shapes, text, connectors, bindings, groups, icons.
3. Step list panel. Enter, exit, morph, emphasis, flow.
4. Preview and scrub.
5. Export in the browser.
6. Save and open files. Autosave.
7. Present mode.
8. Static Docker image.
9. Hosted web app (beta).

**Exit gate:**

- [ ] A new tester makes Example A in less than 15 minutes, with no help (5 testers, 4 must pass).
- [x] Examples A, C, and D are possible with the editor only. (`pnpm build:templates` builds them with editor operations only: `assets/templates/`.)
- [x] Performance budgets for preview and drag pass. Chrome (app browser pane, Apple Silicon), 300 elements at 1080p, with a forced pixel read-back: clean 7.6–8.0 ms (budget 8 ms), sketch 10.6 ms (budget 12 ms). A drag frame costs the same as a preview frame, less than the 16 ms drag budget. Measure with `window.__anivoBench('clean')` in a dev build, or `pnpm bench` in Node (CPU raster, slower).
- [ ] `docker run` serves a working app.

## Phase 2 — Agent ready (5 weeks)

**Goal:** An agent makes a video with no human help.

Scope: FR-AGENT 02–07, 13. FR-CANVAS 16. FR-FILE 02.

1. Anivo Script parser, compiler, printer.
2. Relative placement and auto layout operations.
3. Lint rules.
4. CLI: all commands in [09](09-agent-interface.md#cli).
5. MCP server over stdio with all tools.
6. Folder file format.
7. `prompts/scene-agent.md` final version. `anivo_guide` tool.
8. Agent eval suite with 20 prompts.

**Exit gate:**

- [ ] Claude Code with `anivo mcp` makes a valid video for 8 of 10 eval prompts with no human edit. (Harness ready: `pnpm eval`. A paid run needs the owner's approval. Self-test on 2026-10-18: 3 of 3 prompts valid with 0 lint errors, written by Claude Code with the CLI; it found two bugs, fixed in #30 and #31.)
- [ ] Mean eval score of 3.5 or more out of 5. (Needs the paid run above.)
- [x] `npx @anivo/cli render` works on macOS, Windows, and Linux in CI. (The bundled CLI, `pnpm build:cli`, runs in the CI `cli` job on the three systems. Publishing to npm is a later task.)
- [x] MCP path escape tests pass.

## Phase 3 — Voice and polish (5 weeks)

**Goal:** Videos with voiceover and captions. Version 1.0 feature set for creators.

Scope: FR-AUDIO 01–05, 07, 09. FR-EXPORT 07, 08. FR-STEP 07–09, 17. FR-CANVAS 12, 13, 15, 18. FR-STYLE 03. FR-FILE 05, 06, 08. FR-PLAY 02, 03. FR-UX 04, 07. FR-EXT 01, 03.

1. Audio import, waveform, cues, script, alignment, captions.
2. Camera, counter, code actions. Timeline panel.
3. Code block, image, and table elements.
4. Excalidraw and Mermaid import.
5. Templates gallery (10 templates).
6. Player web component.

**Exit gate:**

- [ ] Examples A to E are all possible.
- [ ] Alignment puts 90% of cues within 300 ms of a manual cue on 5 test recordings.
- [ ] Player bundle is less than 150 KB gzip.

## Phase 4 — Live agents in the web app (2 weeks)

**Goal:** An agent edits the scene that the user sees in the browser.

Scope: FR-AGENT 08 (web bridge), 09. FR-EXPORT 05 (CLI only).

1. Web bridge: `anivo mcp --attach --web` with a pairing code.
2. Agent cursor and change outlines in the editor.
3. Review mode: accept or reject agent transactions.
4. ProRes 4444 export in the CLI.

**Exit gate:**

- [ ] Journey 4 works in Chrome on macOS, Windows, and Linux.
- [ ] Bridge security tests pass (wrong pairing code, wrong origin, remote address, expired code).

## Phase 5 — AI panel and 1.0 release (3 weeks)

Scope: FR-AGENT 10. Release work.

1. AI panel with 3 providers.
2. Documentation site with a tutorial video for each journey.
3. Release 1.0: hosted web app, Docker images, npm packages (CLI, MCP server, player). No desktop app.
4. Launch posts (Hacker News, Reddit, YouTube demo).

**Exit gate:**

- [ ] All P0 and P1 features pass their acceptance criteria.
- [ ] All goals in [02](02-vision-and-scope.md#goals-for-version-10) pass.

## After 1.0 (P2 items, no fixed sequence)

- Share links and the optional server (FR-SHARE-01, if not done earlier).
- Real-time collaboration with Yjs (FR-SHARE-02).
- WebMCP tools (FR-AGENT-12).
- Path morph, motion paths (FR-STEP-14, 15).
- Lottie and animated SVG export.
- Text to speech, sound effects, ducking.
- Plugin API.
- Standalone CLI binary.

## Total estimate

| Phase | Weeks |
|---|---|
| 0 Spike | 2 |
| 1 MVP editor | 8 |
| 2 Agent ready | 5 |
| 3 Voice and polish | 5 |
| 4 Live agents in the web app | 2 |
| 5 AI panel and release | 3 |
| **Total to 1.0** | **25 weeks (approximately 6 months part-time)** |
| 6 Desktop app (deferred, see below) | 4 to 5 |

## Phase 6 — Desktop app (deferred)

**Decision 2026-10-17:** build the desktop app last. Build it only after users know and use Anivo.
The web app, the Docker image, and the CLI give all core features before this phase.

**Start gate.** Start phase 6 only if two or more of these conditions are true for 2 months:

- [ ] 5,000 or more monthly active web app users.
- [ ] 2,000 or more CLI downloads each month.
- [ ] 25 or more GitHub issues or discussion requests for a desktop app.
- [ ] A clear need that the web app cannot meet (for example, large exports that fail in the browser).

**Before you start:** examine the desktop decision again (Electron or Tauri). Use the data from the web app and the state of WebCodecs in system web views at that time. See [11](11-distribution.md#desktop-app-deferred).

Scope: native files and folder watcher, FFmpeg export in the app, whisper.cpp, built-in MCP server (Streamable HTTP), OS keychain, signed installers and auto update for 3 OS.

**Exit gate:**

- [ ] Journey 4 works in the desktop app on macOS and Windows.
- [ ] Signed installers install with no OS security warning.
- [ ] Bridge security tests pass for the desktop MCP server.

> **NOTE:** A public beta after phase 2 is recommended. The agent-ready web app plus the CLI is already a complete product for many users.
