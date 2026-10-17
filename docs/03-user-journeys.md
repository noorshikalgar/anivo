# 03 — User journeys

## Personas

| Persona | Description | Skills | Device |
|---|---|---|---|
| **Ravi, tech YouTuber** | Makes two DevOps videos each week. Uses DaVinci Resolve. Pays for no motion design tool. | Diagrams: high. Animation: low. | macOS laptop |
| **Meera, college teacher** | Teaches networks. Presents in class from a browser. | Diagrams: medium. Animation: none. | Windows PC, school network |
| **Sam, developer** | Writes the docs for an open-source library. Wants GIFs in the README. | Code: high. Design: low. | Linux |
| **Claude Code agent** | Runs on Sam's computer. Reads a repository and makes an explainer video. | Text and code: high. Coordinates: low. | Headless, CLI and MCP server |
| **Platform team** | Runs internal tools for 400 engineers. Data must not leave the company network. | Ops: high. | Kubernetes cluster |

## Journey 1 — Manual video (Ravi)

1. Ravi opens the web app.
2. Ravi selects the template "Request flow". Or Ravi starts with an empty scene.
3. Ravi draws the elements: shapes, text, connectors, icons.
4. Ravi selects the style `clean` and the theme "Slate dark".
5. Ravi clicks "Add step". The step list shows step 1.
6. Ravi selects the element `user` and selects the effect `draw-on`.
7. Ravi adds step 2. Ravi moves the load balancer to a new position. Anivo records a morph.
8. Ravi adds a flow on the connectors from the load balancer to the pods.
9. Ravi imports `voiceover.mp3`. Anivo shows the waveform.
10. Ravi pastes the script. Anivo makes a transcript and links each script line to a step.
11. Ravi drags a step edge to adjust a cue.
12. Ravi presses Space to preview.
13. Ravi exports MP4, 1080p, 60 fps, with the voiceover. Ravi also exports an SRT file.
14. Ravi imports the MP4 into DaVinci Resolve for the final edit.

## Journey 2 — AI panel in the editor (Ravi)

1. Ravi opens the AI panel. Ravi enters an API key, or Ravi selects a local Ollama model.
2. Ravi writes: "Explain how a CDN cache works. Six steps. Clean style."
3. The agent writes Anivo Script. The editor shows the operations in review mode.
4. Ravi sees the new elements with a colored outline. The step list shows six new steps.
5. Ravi rejects step 5. Ravi accepts the other steps.
6. Ravi writes: "Make the origin server larger and add a cache miss in step 4."
7. The agent sends a new transaction. Ravi accepts it.
8. Ravi continues with step 9 of Journey 1.

## Journey 3 — Headless agent (Sam and Claude Code)

1. Sam installs the CLI: `npm i -g @anivo/cli`.
2. Sam adds the MCP server to Claude Code: `claude mcp add anivo -- anivo mcp`.
3. Sam writes: "Make a 30-second video that explains the auth flow in `src/auth/`. Export a GIF for the README."
4. The agent reads the code.
5. The agent calls `anivo_scene_create` and `anivo_script_apply` with Anivo Script.
6. The agent calls `anivo_lint`. The lint result shows two overlapped elements.
7. The agent calls `anivo_script_apply` with a layout fix.
8. The agent calls `anivo_preview` for steps 1, 3, and 6. The agent examines the PNG images.
9. The agent calls `anivo_export` with format `gif`, width 800.
10. The agent writes `docs/auth-flow.gif` and `docs/auth-flow.anivo.json`.
11. Sam opens `auth-flow.anivo.json` in the web app later and changes a label by hand.

## Journey 4 — Live agent in the web app (Ravi)

1. Ravi opens a scene in the web app in Chrome.
2. Ravi runs `anivo mcp --attach --web` in a terminal. The CLI shows a pairing code.
3. Ravi clicks "Connect agent" in the web app and enters the pairing code. Ravi's agent connects through the bridge.
4. Ravi sees an "Agent" cursor. The agent draws elements live. Each change shows in review mode.
5. Ravi moves an element while the agent works. The operation bus applies both changes in sequence.
6. Ravi clicks "Disconnect agent".

> **NOTE:** After phase 6, the desktop app has the same flow with a built-in MCP server and no terminal step.

## Journey 5 — Present live (Meera)

1. Meera opens a scene in the browser.
2. Meera clicks "Present". The editor shows the canvas in full screen.
3. Each click or right-arrow key plays the next step.
4. The left-arrow key goes back one step. It shows the end state of the previous step.
5. Meera presses Escape to stop.

## Journey 6 — Embed in docs (Sam)

1. Sam exports the scene as a player bundle, or Sam hosts the `.anivo.json` file.
2. Sam adds `<anivo-player src="auth-flow.anivo.json" controls></anivo-player>` to the docs page.
3. The reader clicks play. The reader can click a step to jump.

## Journey 7 — Self-host (Platform team)

1. The team runs `docker run -p 8080:80 ghcr.io/noorshikalgar/anivo:latest`.
2. Engineers open the internal address. The web app works with no backend.
3. The team adds the optional server with `docker compose` for share links and collaboration.
4. The team sets the AI panel to use the company LLM gateway. They use an environment variable.

## Five example videos

Each example is an acceptance test for version 1.0. Anivo must make each video with built-in features only.

### Example A — How a load balancer works

| Step | Change | Action types |
|---|---|---|
| 1 | The `user` element draws on. | `enter` (`draw-on`) |
| 2 | The `lb` element pops in. The connector from `user` to `lb` draws. | `enter` (`pop`, `draw-on`) |
| 3 | Three pods pop in with a stagger of 150 ms. | `enter` (`pop`, stagger) |
| 4 | Requests flow round-robin to the pods. | `flow` |
| 5 | Pod 3 turns red and shakes. The flow skips pod 3. | `morph`, `emphasis` (`shake`), `flow` |
| 6 | A new pod 3 appears. The caption shows "Self-healing". | `enter`, `exit`, `morph` |

### Example B — Git branch and merge

| Step | Change | Action types |
|---|---|---|
| 1 | Commit dots draw from left to right on the `main` line. | `enter` (stagger) |
| 2 | A `feature` connector curves up from commit 2. | `enter` (`draw-on`) |
| 3 | Three commits pop onto the `feature` line. | `enter` (`pop`, stagger) |
| 4 | The branch curves back to `main`. A merge commit pulses. | `enter`, `emphasis` (`pulse`) |
| 5 | The camera zooms to the merge commit. A label shows `git merge feature`. | `camera`, `enter` (`typewriter`) |

### Example C — TCP three-way handshake

| Step | Change | Action types |
|---|---|---|
| 1 | Client and server shapes appear. Dashed time lines draw down. | `enter` |
| 2 | A `SYN` connector moves from left to right. | `enter` (`draw-on`) |
| 3 | A `SYN-ACK` connector moves back. | `enter` (`draw-on`) |
| 4 | An `ACK` connector moves across. Both shapes turn green. The label "Connected" appears. | `enter`, `morph` |

### Example D — Docker image layers

| Step | Change | Action types |
|---|---|---|
| 1 | An empty group with the label "image" appears. | `enter` |
| 2 | Three layers slide in from the top, one at a time. | `enter` (`slide`, stagger) |
| 3 | The code changes. Only the top layer flashes and rebuilds. The label shows "cached layers reused". | `emphasis` (`flash`), `exit`, `enter` |

### Example E — Database index

| Step | Change | Action types |
|---|---|---|
| 1 | A table with 10 rows appears. A highlight scans each row. A counter shows the lookups. | `enter`, `emphasis`, `counter` |
| 2 | The table morphs into a B-tree. | `morph` |
| 3 | The search goes root → branch → leaf. The counter shows "10 → 3 lookups". | `emphasis`, `counter` |

> **NOTE:** Example E step 2 morphs a table into a tree. This needs element morph by matched IDs. It does not need path morph between different shape types. See [06](06-animation-engine.md#morph).
