# 14 — Risks and open questions

## Risks

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Scope creep: the feature list is large for one developer | High | High | Strict phase gates. Public beta after phase 2. P2 items stay out until 1.0 |
| R2 | Text looks different in the browser and in Node | Medium | High | Own font metrics. Bundled fonts. Cross-engine test in phase 0 |
| R3 | Animation does not look professional ("cheap") | Medium | High | Spend phase 0 time on easing and `draw-on`. Compare with After Effects examples. Ask 5 creators for feedback in phase 1 |
| R4 | Safari and Firefox export gaps | Medium | Medium | Codec detection. Clear messages. CLI and server render as alternatives |
| R5 | Agents make cluttered layouts | High | Medium | Relative placement, auto layout, lint, contact sheet, eval suite. Templates as few-shot examples |
| R6 | Icon license problems | Low | Medium | Decided 2026-10-17: bundle only free open-source packs (Lucide default). Vendor cloud icons only as user imports |
| R7 | Existing projects (Excalimate, Excalidraw Smart Presentation, Excalidraw Animator) take the space first | Medium | Medium | Differentiate: voiceover sync, diagram-aware flow, agent-first interface, CLI and headless export |
| R8 | Code-sign certificates cost money every year (phase 6 only) | High | Low | Apply for free open-source signing (SignPath Foundation for Windows). Budget for the Apple Developer Program |
| R9 | WebCodecs or MCP specifications change | Low | Medium | Thin adapter layers. Pin SDK versions |
| R10 | Whisper model download is too large for some users | Medium | Low | Offer the `tiny` model. Manual cues always work |
| R11 | Another person claims the `@anivo` npm scope first | Low | Medium | Create the free npm organization `anivo` before the first publish. The bare name `anivo` was free on 2026-10-17 |
| R12 | Electron app size gets complaints (phase 6 only) | Medium | Low | Examine Tauri again before phase 6. Download FFmpeg on demand to cut size |
| R13 | Fluent UI v9 adds weight to the initial JS bundle | Medium | Low | Tree-shake icons. Lazy-load heavy panels. Measure against the 400 KB budget in phase 1 |

## Open questions

Each question has an owner and a deadline phase. Record each answer as a decision record in `docs/decisions/NNNN-title.md`.

| # | Question | Options | Recommendation | Decide by |
|---|---|---|---|---|
| Q1 | Final product name and domain | **Decided 2026-10-17: Anivo.** Bare npm name free. No public packages under `@anivo`. Repository `noorshikalgar/anivo`. Still to do: create the npm organization, check a domain and trademarks | — | Phase 1 |
| Q2 | Hand-drawn font | **Decided 2026-10-17: Kalam.** See [decision 0001](decisions/0001-sketch-font.md) | — | Done |
| Q3 | UI component kit | **Decided 2026-10-17: Fluent UI React v9.** See [10](10-architecture.md#editor-ui-kit) | — | Done |
| Q4 | Web bridge security model with Chromium "local network access" | WebSocket to `127.0.0.1` with pairing, or a browser extension | WebSocket with pairing. Test the permission prompt in phase 4 | Phase 4 |
| Q5 | Share link host for the public instance | Cloudflare R2 + Worker, own server | Cloudflare R2 + Worker (low cost, no server to manage) | After 1.0 |
| Q6 | Is the AI panel on by default | On with no key, hidden, off | Visible, with an empty state that asks for a provider | Phase 5 |
| Q7 | Monetization (if any) | None, hosted Pro (server render, cloud TTS), sponsors | None until 1.0. GitHub Sponsors only | After 1.0 |
| Q8 | Telemetry endpoint | None, self-hosted Plausible, PostHog | None in v1. Opt-in self-hosted counts later | Phase 5 |
| Q9 | Minimum supported browsers | Chromium only, or also Firefox and Safari | Edit in all three. Full export in Chromium and Firefox. Partial export in Safari | Phase 1 |
| Q10 | Scene coordinate default size | 1920 × 1080 canvas unit, or free | 1920 × 1080 camera by default. Infinite canvas around it | Phase 0 |
| Q11 | Does a `click` step have a duration in exported video | Same as `auto`, or a pause of N ms | Same as `auto` plus `holdMs` | Phase 1 |
| Q12 | Language for Anivo Script keywords | English only, or localized | English only. Labels can be in any language | Phase 2 |

## Competitor watch

Examine these projects before phase 1 and before 1.0. Record what they do well and what they lack.

| Project | Type | Watch for |
|---|---|---|
| Excalimate | Excalidraw-based keyframe animation, MCP server | Agent tools, timeline UX, export quality |
| Excalidraw Smart Presentation | Excalidraw fork, morph between frames | Morph quality |
| Excalidraw Animator | Excalidraw-based presets | Effect list |
| excalidraw-animate | Stroke replay | `draw-on` look |
| Motion Canvas, Revideo | Code-first animation | Timing model, editor, audio sync |
| Remotion | React video | Render pipeline, licensing model |
| Manim | Python math animation | Morph and transform ideas |
| Jitter, Rive, SVGator | Commercial motion tools | UX standards that users expect |
