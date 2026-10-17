# 12 — Quality and security

## Test strategy

| Level | Tool | What it tests | Runs |
|---|---|---|---|
| Unit | Vitest | Schema, operations, inverses, easing, `resolveTimeline`, `evaluate`, parser, lint rules | Each commit |
| Property | Vitest + fast-check | `invert(apply(op))` gives the old scene. `parse(print(s))` equals `s`. Migrations keep data | Each commit |
| Golden frame | Vitest + `@napi-rs/canvas` + pixelmatch | `render(evaluate(scene, t))` equals the stored PNG | Each commit |
| Cross-engine | Playwright (Chromium) + Node | The browser frame and the Node frame differ by less than 0.5% of pixels | Each PR |
| Export | CLI + `ffprobe` | Duration, frame count, codec, alpha channel, audio stream | Each PR |
| End to end | Playwright | Journeys 1, 3, 5 from [03](03-user-journeys.md) | Each PR |
| MCP contract | MCP SDK client | Each tool: valid input, invalid input, path escape attempt | Each PR |
| Accessibility | axe-core in Playwright | Zero critical issues in the editor | Each PR |
| Performance | Vitest bench + Playwright traces | Budgets below | Each night |
| Agent eval | `evals/` runner | See [09](09-agent-interface.md#agent-eval-suite) | Each week |

### Golden frame rules

1. Store golden PNG files in `tests/golden/<scene>/<step>-<at>.png`.
2. Render goldens with the Node engine at 960 × 540.
3. If a golden changes, the PR must show the old and the new image. CI posts both as a comment.
4. Update goldens only with `pnpm test:golden --update`. Never update them automatically in CI.

> **CAUTION:** Fonts, Rough.js version, and `@napi-rs/canvas` version change pixels. Pin these versions exactly. Update them in a separate PR with new goldens.

## Performance budgets

| Item | Budget | Measured on |
|---|---|---|
| Editor first load (hosted, cold cache) | Less than 2.5 s to interactive, less than 400 KB gzip initial JS | Chrome, fast 4G profile |
| Preview frame, 300 elements, `clean` | Less than 8 ms | Apple M1 |
| Preview frame, 300 elements, `sketch` | Less than 12 ms | Apple M1 |
| Pointer drag latency | Less than 16 ms | Apple M1 |
| Export 60 s, 1080p60, browser | Less than 2 min | Apple M1, Chrome |
| Export 60 s, 1080p60, CLI | Less than 90 s | Apple M1 |
| Open a scene with 1000 elements, 100 steps | Less than 1 s | Apple M1 |
| Anivo Script parse + compile, 500 lines | Less than 50 ms | Node 22 |
| Player bundle | Less than 150 KB gzip | |

## Security

### Threat model

| Threat | Entry point | Control |
|---|---|---|
| Malicious scene file runs code | File open, share link, player `src` | Scene files contain data only. No scripts, no expressions, no HTML. Validate with Zod. Reject unknown fields in strict mode |
| Malicious SVG (scripts, external references) | Icon import, image import, paste | Sanitize with DOMPurify (SVG profile). Remove `<script>`, event attributes, `<foreignObject>`, and external `href`. Convert to path data before storage |
| Large file stops the app (zip bomb, huge image) | File open | Limit: 200 MB uncompressed scene archive, 20 MB per image, 30 min audio, 20,000 elements. Check sizes before decompression |
| Agent writes outside its folder | MCP file mode | Path check against `--root` after `realpath`. Reject symbolic links that leave the root |
| Web page controls the editor through the bridge | Bridge | Bind to `127.0.0.1`. Token or pairing code. `Origin` check. One-time pairing codes expire in 5 minutes |
| API key leak | AI panel | Keychain (desktop). Never in scene files, logs, share links, or error reports. Redact keys in logs with a pattern match |
| Prompt injection through scene text | AI panel, MCP | Treat scene text as data. The scene-agent prompt tells the agent this. Agent operations still pass schema validation. Review mode is on by default for the AI panel |
| Share link server reads user data | Server | End-to-end encryption: AES-GCM with a key in the URL fragment. The server stores only ciphertext |
| Server abuse | Server render, remote MCP | API tokens. Rate limits. Job limits (see [07](07-rendering-and-export.md#server-render-optional)) |
| Supply chain | npm dependencies | Lockfile. `pnpm audit` in CI. Renovate with a delay of 3 days for new versions. Minimal dependency count in core packages |
| Electron remote code | Desktop app | See the settings in [11](11-distribution.md#electron-security-settings) |

### Privacy

1. Telemetry is off by default. If the user turns it on, collect only anonymous counts: app version, export format, export duration, error codes.
2. Never collect scene content, file names, audio, or prompts.
3. The hosted web app makes no network calls after load, except: icon packs and fonts from the same origin, Whisper model download (after the user agrees), and AI provider calls (after the user enters a key).
4. Publish a privacy page in plain STE text.

## Licenses

### Anivo code

- License: **MIT**, the same as Excalidraw. It allows commercial use and forks.
- Contributor terms: DCO sign-off (`Signed-off-by`) on each commit. No CLA.

### Third-party assets

**Icon policy:** Anivo bundles only free open-source icon packs. The editor UI uses Fluent icons. Scenes use Lucide by default, and Fluent System Icons as a second bundled pack. Users can import their own SVG folders (FR-EXT-01), for example vendor cloud icons that they downloaded under the vendor terms.

> **CAUTION:** Check the license of each icon pack and font before you bundle it. Record the result in `assets/LICENSES.md`. Some brand and cloud icon packs allow use in diagrams but do not allow redistribution in an icon library.

| Asset | License (to confirm) | Bundle? |
|---|---|---|
| Lucide | ISC | Yes. Default scene pack |
| Fluent System Icons (`@fluentui/react-icons`, `fluentui-system-icons`) | MIT | Yes. Editor UI icons, and a bundled scene pack |
| Tabler Icons | MIT | Yes. Optional pack |
| Simple Icons (brand logos) | CC0 for the SVG data. Each brand has trademark rules | Optional pack, with a trademark notice |
| Kubernetes community icons | CC BY 4.0 (confirm) | Optional pack. Show attribution in `assets/LICENSES.md` and the about screen |
| AWS, Azure, GCP architecture icons | Vendor terms, not open source | No. Do not bundle. The user can import them as a custom pack |
| Inter, JetBrains Mono, Noto Sans | OFL 1.1 | Yes |
| Hand-drawn font | Confirm OFL for the selected font | Yes, if OFL |

## Accessibility of exported videos

1. Captions are available for each video with a script (see [08](08-audio-and-captions.md)).
2. Lint `low-contrast` and `tiny-text` warn about readability.
3. Themes have a minimum text contrast of 4.5:1 by default.
4. Option "Reduce flash": limit `flash` and `shake` effects to a maximum of 3 flashes in each second, to lower the risk for viewers with photosensitive epilepsy.
