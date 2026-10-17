# 11 — Distribution

## Decision summary

Anivo ships in **five forms from one codebase**. Version 1.0 has four of them. The desktop app comes last, after users know Anivo. The web app is the reference product. Each other form adds capabilities that a browser cannot give.

| Form | For whom | How the user gets it | Phase |
|---|---|---|---|
| **Hosted web app** | Everyone. First contact | Open `anivo.<domain>` in a browser. No install | 1 |
| **Docker image** | Teams, privacy users, offline networks | `docker run -p 8080:8080 ghcr.io/noorshikalgar/anivo` | 1 |
| **CLI + MCP server** | Developers, agents, CI | `npm i -g @anivo/cli` or `npx @anivo/cli` | 2 |
| **Desktop app** | Creators who export a lot, want native files and offline speech in one app | Download a signed installer from GitHub Releases. Also Homebrew cask, winget, Flatpak | 6 (deferred, adoption gate) |
| **Player** | Docs sites, blogs | `npm i @anivo/player` or a `<script>` tag from a CDN | 3 |

## Why web first

1. **No install** gives the most users. Excalidraw grew this way.
2. **One build** runs on Windows, macOS, Linux, and ChromeOS.
3. **Self-host is free.** The web app is static files. A Docker image with a static server is enough.
4. **Chromium has all needed APIs:** Canvas 2D, WebCodecs, Web Audio, File System Access, WebGPU (for Whisper).

## What each form can do

| Capability | Web app | Docker (static) | Docker + server | Desktop app | CLI |
|---|---|---|---|---|---|
| Draw, steps, preview | Yes | Yes | Yes | Yes | — |
| Export MP4, WebM, GIF | Yes (Chromium, Firefox) | Yes | Yes | Yes | Yes |
| Export ProRes, PNG sequence to a folder | — | — | Server render | Yes | Yes |
| Open and save local files | Chromium: yes. Others: download | Same | Same | Yes, native | Yes |
| Folder format for Git | Chromium only | Same | Same | Yes | Yes |
| Speech recognition | Yes (WebGPU, model download) | Yes | Yes | Yes (whisper.cpp, faster) | Yes |
| Agent bridge | Yes, through `anivo mcp --attach --web` | Same | Same | Yes, built in | — (is the agent side) |
| Headless render for agents and CI | — | — | Yes (render queue) | — | Yes |
| Share links | — | — | Yes | Through a configured server | — |
| Collaboration (P2) | — | — | Yes | Through a configured server | — |
| Works fully offline | Yes, after first load (PWA) | Yes, in a closed network | Yes | Yes | Yes |

## Hosted web app

- Static SPA, built by Vite. Installable PWA with a service worker.
- Host on Cloudflare Pages (or a similar static host). No backend for the core product.
- Scenes stay in the browser (IndexedDB) or in local files.
- The optional public server (share links) runs separately. It never receives plain scene data (end-to-end encryption).

> **NOTE:** The hosted app has no accounts in v1. This removes most privacy and cost risks.

## Docker image

### Image 1: `ghcr.io/noorshikalgar/anivo` (static)

- Base: `nginxinc/nginx-unprivileged:alpine` (non-root user, port 8080). Build: `docker build -f docker/Dockerfile -t anivo .`
- Contains the built web app only (approximately 3 MB). Size target: less than 70 MB. (The NGINX base image is approximately 57 MB.)
- Health check: `GET /healthz`.
- Runtime configuration through environment variables, written to `/config.js` at container start:

| Variable | Purpose | Default |
|---|---|---|
| `ANIVO_SERVER_URL` | Optional server for share links and collaboration | empty (off) |
| `ANIVO_AI_PROVIDERS` | Allowed AI providers in the AI panel | `anthropic,openai,ollama` |
| `ANIVO_AI_BASE_URL` | Company LLM gateway URL | empty |
| `ANIVO_TELEMETRY` | `off` or an endpoint | `off` |
| `ANIVO_DISABLE_EXTERNAL` | `true` blocks all external network calls (fonts, models, CDN) | `false` |

### Image 2: `ghcr.io/noorshikalgar/anivo-server` (optional)

- Node 22 + FFmpeg + fonts. Contains `apps/server`.
- Services: share-link storage (encrypted blobs), collaboration relay (P2), render queue, remote MCP endpoint (Streamable HTTP, with API tokens).
- Storage: local disk volume or an S3-compatible bucket.

### `compose.yaml` (example)

```yaml
services:
  web:
    image: ghcr.io/noorshikalgar/anivo:latest
    ports: ["8080:8080"]
    environment:
      ANIVO_SERVER_URL: http://localhost:8081
  server:
    image: ghcr.io/noorshikalgar/anivo-server:latest
    ports: ["8081:8081"]
    environment:
      ANIVO_STORAGE: file:///data
      ANIVO_RENDER_CONCURRENCY: "2"
    volumes: ["anivo-data:/data"]
volumes:
  anivo-data:
```

Also publish a Helm chart (P2) for Kubernetes.

> **WARNING:** If a team exposes `anivo-server` on a network, set `ANIVO_API_TOKENS`. Without tokens, any person on the network can start render jobs and use the remote MCP endpoint.

## CLI and MCP server

- Package: `@anivo/cli`. Command: `anivo`.
- Requires Node 20 or later. `@napi-rs/canvas` has prebuilt binaries for macOS (x64, arm64), Windows (x64, arm64), and Linux (x64, arm64, glibc and musl).
- FFmpeg: use the system `ffmpeg` if it exists. If not, download `ffmpeg-static` on first export. Ask the user first.
- Agent setup examples go in the README:

```bash
claude mcp add anivo -- npx -y @anivo/cli mcp --root ./videos
```

- Also publish a standalone binary (P2) with Node SEA for users without Node.

## Desktop app (deferred)

> **NOTE:** Decision 2026-10-17: the desktop app is the last phase. Do not build it before the start gate in [13](13-roadmap.md#phase-6--desktop-app-deferred) passes. Until then, the CLI gives ProRes, PNG sequence, and whisper.cpp. The web bridge gives live agents. The sections below are the plan for that later phase. Examine the Electron decision again before phase 6 starts.

### Preferred option: Electron

| Option | Result |
|---|---|
| **Electron** | **Selected.** Same Chromium on all OS: the renderer, fonts, and WebCodecs behave the same as in the web app. Node in the main process runs the CLI code, the MCP server, FFmpeg, and whisper.cpp with no extra runtime. |
| Tauri 2 | Smaller download (approximately 10 MB instead of 100 MB). But it uses the system web view: WKWebView on macOS and WebKitGTK on Linux. WebCodecs support and canvas text output differ from Chromium. It also needs a separate JavaScript runtime for the Node-based CLI and MCP code. Rejected for v1. Examine again after v1. |
| Native (Rust + GPU UI) | Too much work. It needs a second renderer. Rejected. |

### What the desktop app adds

1. Native open, save, and recent files. File association for `.anivo` and `.anivo.txt`.
2. Folder format for Git, with a file watcher. If an agent or Git changes `scene.json`, the editor reloads the scene.
3. FFmpeg export: ProRes 4444, PNG sequence, HEVC with alpha.
4. whisper.cpp for fast local speech recognition.
5. Built-in MCP server and bridge (see [09](09-agent-interface.md#bridge-agent-live-in-the-editor)).
6. OS keychain for API keys.
7. Bundled `anivo` CLI. Menu item "Install command line tool".

### Desktop build and release

| Item | Value |
|---|---|
| Builder | `electron-builder` |
| macOS | DMG, universal (arm64 + x64), signed with a Developer ID, notarized |
| Windows | NSIS installer and MSIX, signed (Azure Trusted Signing or an OV certificate) |
| Linux | AppImage, `.deb`, Flatpak |
| Auto update | `electron-updater` with GitHub Releases. The user can turn it off |
| Size target | Less than 150 MB installer (FFmpeg is the largest part) |

> **CAUTION:** Unsigned apps show security warnings on macOS and Windows. Many users stop there. Budget for code-sign certificates before the desktop release. See [14](14-risks-and-open-questions.md).

### Electron security settings

> **WARNING:** Use these settings for each window. Without them, a malicious scene file or a compromised dependency can run code on the user's computer.

1. Set `contextIsolation: true`.
2. Set `nodeIntegration: false`.
3. Set `sandbox: true`.
4. Expose a small typed API through `contextBridge` in the preload script. Do not expose `ipcRenderer` directly.
5. Validate every IPC message in the main process with Zod.
6. Set a strict Content Security Policy. Do not allow remote scripts.
7. Block navigation to other origins. Open external links in the system browser.

## Player

- `@anivo/player`: a web component `<anivo-player>`.
- Includes the core packages only (schema, engine, layout, render). No editor code.
- Size budget: less than 150 KB gzip, without fonts and icon packs.
- Loads fonts and icons used by the scene only.
- Also available as a self-contained HTML export (see [07](07-rendering-and-export.md)).

## Recommended path for a new user

```
Curious ─► hosted web app ─► likes it ─┬─► makes many videos ─► CLI for ProRes now, desktop app later
                                       ├─► uses an agent ─────► CLI + MCP server
                                       ├─► team use ──────────► Docker image
                                       └─► docs ──────────────► player
```
