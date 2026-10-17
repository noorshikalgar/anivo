# 07 — Rendering and export

## Renderer

### Decision: Canvas 2D for all output

| Option | Result |
|---|---|
| **Canvas 2D** | **Selected.** Same API in the browser (`HTMLCanvasElement`, `OffscreenCanvas`) and in Node (`@napi-rs/canvas`, Skia). Fast. Rough.js supports it. |
| SVG DOM | Slow with many animated elements. Not available in Node without a browser. Used only for the static SVG export. |
| WebGL / WebGPU | Fast, but text and stroke quality need much more work. Not needed for 2D diagrams at 300 elements. Possible later for a large-scene mode. |

### Rules

1. The renderer receives a `FrameState` and a `RenderTarget`. It draws. It does not change the scene.
2. The renderer uses only a small interface, `Ctx2D`. This interface is the common part of browser Canvas 2D and `@napi-rs/canvas`. Do not use browser-only APIs inside the renderer.
3. The renderer measures text with its own font metrics from the font files. It does not use DOM measurement. This keeps text layout the same in the browser and in Node.
4. Each style (`clean`, `sketch`) is a module with the same interface: `drawShape`, `drawConnector`, `drawText`, `drawIcon`.
5. The editor overlays (selection boxes, handles, guides) are a separate layer. The export never draws them.

### Layers in the editor

```
┌───────────────────────────────┐
│ DOM layer: text edit input    │  (only during text edit)
├───────────────────────────────┤
│ Canvas: editor overlay        │  selection, handles, guides, agent cursor
├───────────────────────────────┤
│ Canvas: scene                 │  the same renderer as the export
└───────────────────────────────┘
```

### Fonts

| Use | Font | License |
|---|---|---|
| `clean` UI and labels | Inter | OFL 1.1 |
| `sketch` labels | A hand-drawn OFL font (candidates: Excalifont, Virgil, Kalam) | OFL 1.1 — confirm the license of each candidate |
| Code | JetBrains Mono | OFL 1.1 |
| CJK and other scripts | Noto Sans (subset loaded on demand) | OFL 1.1 |

> **CAUTION:** Bundle the font files. Do not load fonts from a CDN at render time. If the font is different, the text layout changes and golden-frame tests fail.

### Icons

1. Store each icon pack as a JSON file: `{ name, tags, viewBox, paths }`.
2. Draw icons as `Path2D` from the SVG path data.
3. For the `sketch` style, draw the icon outline with Rough.js `path()`.
4. Load packs on demand. Do not load all packs at start.

## Export

### Decision: two export engines with one frame source

```
                 ┌──────────────► Browser: WebCodecs VideoEncoder + Mediabunny (MP4/WebM mux)
evaluate+render ─┤
 (frame by frame)└──────────────► Node (CLI, desktop): @napi-rs/canvas ──► FFmpeg (stdin raw RGBA)
```

| Engine | Where | Formats |
|---|---|---|
| **Browser** | Web app, desktop app (Chromium has WebCodecs) | MP4 (H.264/AAC), WebM (VP9/Opus, with alpha), GIF, PNG |
| **Node + FFmpeg** | CLI, desktop app, server render | All browser formats, plus ProRes 4444, PNG sequence, HEVC with alpha (macOS) |

### Export procedure (both engines)

1. Validate the scene. If the scene has lint errors of level `error`, stop and show them.
2. Load all fonts, icons, images, and audio. Wait until all are ready.
3. Calculate `frameCount = ceil(totalMs × fps / 1000)` for the selected range.
4. For each frame `i`:
   1. Calculate `t = rangeStart + i × 1000 / fps`.
   2. Call `evaluate(scene, t)`.
   3. Render to an offscreen canvas at the export size.
   4. Send the frame to the encoder. Wait if the encoder queue has more than 8 frames.
5. Mix the audio tracks to one stereo track at 48 kHz. Encode it.
6. Mux video and audio.
7. Write the file. Show the file size.

> **CAUTION:** Do not use `requestAnimationFrame` or a real-time clock for export. Render each frame offline. A slow frame then does not cause a dropped frame.

### Browser support

| Browser | WebCodecs video encode | Result |
|---|---|---|
| Chrome, Edge (desktop) | Yes | Full export |
| Firefox (130 and later) | Yes | Full export. Test H.264 availability on Linux, because it depends on system codecs |
| Safari | Partial | Export WebM may not work. Detect each codec with `VideoEncoder.isConfigSupported`. Offer the formats that work. Recommend Chrome or the CLI for the others |

> **NOTE:** Do not use `ffmpeg.wasm` as the default fallback. It is slow and large. Keep it as an optional P2 fallback.

### Alpha export

- WebM VP9 with alpha: browser and Node.
- ProRes 4444: Node + FFmpeg only.
- MP4 H.264 cannot have alpha. If the background is `transparent` and the format is MP4, show: "MP4 cannot store transparency. Use WebM or ProRes."

### GIF export

1. Render frames at the GIF size and frame rate.
2. Calculate one palette for the full GIF (sample 1 frame of each 10).
3. Encode with `gifenc` in the browser. Use FFmpeg `palettegen`/`paletteuse` in Node.
4. Show a size estimate before export. If the estimate is more than 15 MB, recommend a smaller width or a lower frame rate.

### Export settings

| Setting | Values | Default |
|---|---|---|
| Format | `mp4`, `webm`, `gif`, `png`, `png-seq`, `prores`, `html`, `svg` (static) | `mp4` |
| Size | 1280×720, 1920×1080, 2560×1440, 3840×2160, or custom | 1920×1080 |
| Frame rate | 24, 30, 60 | 60 |
| Quality | `draft` (fast, low bitrate), `standard`, `high` | `standard` |
| Range | all, step range, time range | all |
| Audio | on, off | on if audio exists |
| Captions | none, burned in, SRT, WebVTT | none |
| Scale factor | 1×, 2× (render at 2× and downscale for sharper lines) | 1× |

### Server render (optional)

The optional server has a render queue. It uses the Node engine. Use it for:

- Users on browsers without WebCodecs.
- Agents that call a remote MCP server.
- Batch export of many scenes.

> **WARNING:** Limit server render jobs. Set a maximum duration (10 minutes of video), a maximum resolution (4K), and a maximum of 2 jobs at the same time for each user. If you do not set limits, one user can stop the server for all users.

## Static export

- **PNG** or **SVG** of the end state of each step. Use it for docs and slides.
- The SVG export uses a separate SVG writer with the same `FrameState` input. The `sketch` style uses Rough.js SVG output with the same seeds.
