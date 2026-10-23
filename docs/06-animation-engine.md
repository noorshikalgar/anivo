# 06 — Animation engine

## Core rule: the timeline is a pure function

```ts
function evaluate(scene: Scene, timeMs: number): FrameState
```

- `evaluate` reads the scene and a time. It returns the state of all elements and the camera at that time.
- `evaluate` has no side effects. It keeps no state between calls.
- `evaluate(scene, t)` gives the same result each time, for the same `scene` and `t`.
- The renderer draws a `FrameState`. The renderer does not know about steps or actions.

> **CAUTION:** Do not use `Math.random()`, `Date.now()`, or `performance.now()` inside `evaluate` or inside the renderer. Use the element `seed` and the `timeMs` argument. If you break this rule, export and preview show different frames, and golden-frame tests fail.

This rule gives:

1. Scrub to any time with no play history.
2. Export frame by frame, offline, with no dropped frames.
3. The same output in the browser, in the CLI, and in the desktop app.
4. Simple tests: one input, one expected image.

## Pipeline

```
Scene ──► resolveTimeline(scene) ──► Timeline  (cached; rebuilt when steps change)
                                        │
Timeline + timeMs ──► evaluate() ──► FrameState ──► layout (connectors, text) ──► Renderer ──► pixels
```

### Stage 1: `resolveTimeline`

`resolveTimeline` converts steps into absolute times. It runs once for each scene change, not for each frame.

1. Set `cursor = 0`.
2. For each step in sequence:
   1. Calculate `start`:
      - `auto`: `start = cursor`.
      - `click`: `start = cursor`. In present mode, the player pauses at `start` until the next click. In export, `click` is the same as `auto`.
      - `cue`: `start = cue.atMs`. If `cue.atMs < cursor`, record a lint warning `step-overlap` and use `cursor`.
   2. For each action, calculate `actionStart = start + delayMs + index × staggerMs` for each target.
   3. Calculate `contentEnd` = the maximum action end.
   4. Set `end = start + (durationMs ?? contentEnd - start)`.
   5. Set `cursor = end + holdMs`.
3. Calculate `totalMs = cursor`.
4. Calculate the **state at each step boundary** (`boundaryState[i]` = state at the end of step `i`). Cache these states.

### Stage 2: `evaluate(scene, t)`

1. Find the step `i` that contains `t`. Use a binary search on step starts.
2. Start from `boundaryState[i - 1]` (or the base state if `i = 0`).
3. Apply each action of step `i` that started before `t`, at its progress `p = clamp((t - actionStart) / durationMs, 0, 1)`, after easing.
4. Apply time-based actions (`flow`) that are active at `t`.
5. Return the result.

The cost of each frame is proportional to the actions in one step, not to the full scene history.

## Visibility rule

- An element with `visible: false` in the base state is not drawn until an `enter` action makes it visible.
- After an `exit` action ends, the element has `visible: false`.
- **Automatic rule:** if the first action that targets an element is `enter`, the loader sets `visible: false` in the base state. The user does not set this by hand.
- A connector is drawn only if the connector is visible. It does not depend on the bound elements. Lint warns if a connector is visible while a bound element is not visible.

## Action types

### `enter` and `exit`

| Effect | What it does | Parameters |
|---|---|---|
| `fade` | Opacity 0 → 1 | — |
| `pop` | Scale 0.6 → 1 with `back-out`, opacity 0 → 1 | `fromScale` (0.6) |
| `scale` | Scale `fromScale` → 1, no overshoot | `fromScale` (0) |
| `slide` | Moves from an offset, opacity 0 → 1 | `direction` (`up`, `down`, `left`, `right`), `distance` (80 px) |
| `draw-on` | Draws the stroke along the path. Then the fill fades in during the last 30% | `fillDelay` (0.7) |
| `wipe` | Clip rectangle grows across the element | `direction` |
| `typewriter` | Shows text one character at a time | `cursor` (true/false) |
| `blur-in` | Not in v1 (needs a filter that is slow in Canvas2D in some browsers) | — |

`exit` uses the same effect in reverse.

**`draw-on` detail:** The renderer flattens each path into line segments and measures the total length. It draws the first `p × length` of the path. For the `sketch` style, Rough.js gives many sub-paths. Draw them in sequence, by cumulative length. Text labels of the element fade in with the fill.

### `morph`

A morph changes element properties from the current state to new values.

**Morphable properties:** `x`, `y`, `width`, `height`, `rotation`, `opacity`, `fill`, `stroke`, `strokeWidth`, `cornerRadius`, `fontSize`, `textColor`, `label.text`, connector `waypoints`.

| Property kind | Interpolation |
|---|---|
| Number | Linear between values, after easing |
| Color | Interpolate in OKLCH. Do not interpolate in sRGB, because sRGB gives gray middle colors |
| Text | Crossfade: old text fades out in the first half, new text fades in in the second half. If the new text starts with the old text, use `typewriter` for the new part |
| Connector path | Interpolate each waypoint. If the waypoint count changes, add points on the shorter path first |
| `parentId` (move to a new group) | Not morphable. Change it at the step start |

**Editor recording of a morph:**

1. The user selects a step.
2. The user changes an element on the canvas.
3. The editor compares the new property with the state at the end of that step.
4. The editor adds the changed properties to a `morph` action in that step. If a `morph` for the same target exists, the editor merges the properties.

**Shape type change** (for example, rectangle to ellipse) is P2. In v1, the editor makes an `exit` (`fade`) for the old element and an `enter` (`fade`) for a new element at the same time.

### `emphasis`

An emphasis is temporary. The state after the action is the same as the state before the action.

| Effect | What it does | Parameters |
|---|---|---|
| `pulse` | Scale 1 → 1.08 → 1, repeated | `count` (2), `scale` (1.08) |
| `shake` | Horizontal offset with a damped sine | `amplitude` (8 px), `count` (4) |
| `wiggle` | Small rotation with a damped sine | `degrees` (4) |
| `glow` | Ring around the element, opacity in and out | `color` (`accent`), `width` (6 px) |
| `flash` | Fill goes to a bright color and back | `color` |
| `highlight` | Marker-style rectangle behind the element | `color` (`warning-soft`) |
| `focus` | All other elements go to opacity 0.25. The targets stay at full opacity | `dimTo` (0.25) |

`focus` can have `durationMs: "step"`. Then the dim stays until the step ends.

### `flow`

A flow draws particles that move along connectors.

```ts
interface FlowParams {
  shape: "dot" | "square" | "pill" | "icon" | "image";
  icon?: string;              // shape "icon": pack:name, for example "lucide:mail"
  assetId?: string;           // shape "image": an image asset (PNG, JPEG, WebP, or SVG)
  size: number;               // px, default 8 (the width of an icon or an image)
  color: string;              // token or hex, default "accent"
  speed: number;              // px per second, default 400
  rate: number;               // particles per second, default 2
  direction: "forward" | "reverse" | "both";
  distribute: "all" | "round-robin" | "random-seeded";
  chainFrom?: ElementId;      // continue particles that arrive from this connector
  skip?: ElementId[];         // connectors to skip in round-robin
  trail?: number;             // 0..1: fading copies behind each particle
  count?: number;             // particles in all; omit for a stream; 1 = one particle travels from start to end
  orient?: boolean;           // turn the particle in the direction of travel
  back?: {                    // with direction "both": own settings of the particles that go back
    shape?, icon?, assetId?, size?, color?, speed?, rate?, count?, trail?, orient?, delayMs?
  };
}
```

With `direction: "both"` and `back`, the flow is two streams: forward with the main settings, and back with `back` (a missing setting uses the main value). Without `back`, the particles alternate. A flow with `count` stops after particle `count - 1`. With `count: 1` and `chainFrom`, one particle travels along a chain of arrows, for example a packet from a user to a server. A particle with an unknown icon or an image that is not decoded draws as a dot; lint reports an unknown icon.

**Deterministic particle position.** Particles are not simulated. Calculate them from `t`:

1. Particle `k` is emitted at `emitK = actionStart + k / rate × 1000`.
2. The connector for particle `k` is `targets[k mod n]` for `round-robin`. For `all`, each target gets each particle. For `random-seeded`, use a hash of `(seed, k)`.
3. The progress of particle `k` on its connector is `(t - emitK) × speed / 1000 / length`.
4. Draw the particle if the progress is between 0 and 1.
5. For `chainFrom`, delay `emitK` by the travel time on the source connector. The particle appears to continue through the bound element.

This needs no state. Seek to any time gives the correct particles.

**Skip example (Example A, step 5):** set `skip: ["c-lb-3"]`. Round-robin then uses only the other two connectors.

### `camera`

```ts
interface CameraParams {
  op: "zoom-to" | "pan" | "reset";
  target?: ElementId[];       // zoom-to: fit these elements
  padding?: number;           // px around the target, default 80
  rect?: { x: number; y: number; width: number; height: number };
  zoom?: number;              // pan with a fixed zoom
}
```

- The camera interpolates its center and its zoom. Interpolate the zoom in log scale, so the zoom speed looks constant.
- The camera rectangle always has the video aspect ratio.
- `reset` goes back to `settings.camera`.

### `counter`

The target is a text element. The text shows `format` with `{n}` replaced by the current value. Round the value to `decimals`. Example: `format: "{n} req/s"`.

### `code`

| `op` | What it does |
|---|---|
| `highlight` | Lines not in `lines` go to opacity 0.35. A background bar moves to the lines |
| `type` | The lines appear one character at a time |
| `diff` | Removed lines turn red and collapse. Added lines turn green and expand |

### `mark`

Words inside one text element (docs/20 B1). Params: `phrase` (whole words, case-insensitive; `occurrence` picks the n-th match), `color`, `highlight` (a box behind the phrase), `underline` (draws in from the left), `dim` (the color of the other words), `clear` (fade out the old marks first). The marks stay in the state after the action, so later steps keep them, until a mark with `clear`. Default: 500 ms, ease-out.

### `wait`

A `wait` action has a duration and does nothing. It extends the step.

## Easing

| Name | Definition |
|---|---|
| `linear` | `p` |
| `ease-in` | cubic Bézier (0.42, 0, 1, 1) |
| `ease-out` | cubic Bézier (0, 0, 0.58, 1) |
| `ease-in-out` | cubic Bézier (0.42, 0, 0.58, 1) |
| `back-out` | Overshoot by 10%, then settle |
| `spring-soft` | Spring, stiffness 120, damping 20, mass 1 |
| `spring-bouncy` | Spring, stiffness 180, damping 12, mass 1 |
| `hold` | No tween: the value stays, then jumps at the end (a hold key) |

**Springs:** use the closed-form solution of the damped harmonic oscillator. Do not use a step-by-step simulation, because a simulation depends on the frame rate. Normalize the spring so that it settles at `durationMs`. If the action has no `durationMs`, use the time when the spring reaches 0.1% of its distance.

## Default timing

If the user does not set a value, use these values:

| Item | Default |
|---|---|
| `enter` duration | 500 ms (`draw-on`: 800 ms, `typewriter`: 40 ms for each character, maximum 2000 ms) |
| `exit` duration | 350 ms |
| `morph` duration | 600 ms |
| `emphasis` duration | 800 ms |
| `stagger` | 120 ms |
| Step `holdMs` | 500 ms |
| Delay of a connector `draw-on` after its source element `enter` | 200 ms (automatic if both are in the same step) |

## Conflicts

Two actions can change the same property of the same element at the same time.

1. The action that is later in the `actions` array wins.
2. Lint reports `action-conflict` with both action IDs.
3. `emphasis` effects add to the state (for example, `shake` adds an offset). They do not conflict with `morph`.

## Present mode behavior

1. At a `click` step start, the player stops.
2. The next click plays the step.
3. A click during a step jumps to the end of the step.
4. "Previous" jumps to the end state of the previous step. It does not play backwards.

## Performance requirements

| Item | Budget |
|---|---|
| `resolveTimeline` for 100 steps, 1000 actions | Less than 20 ms |
| `evaluate` for 300 visible elements | Less than 2 ms |
| Full frame (evaluate + layout + render) at 1080p, 300 elements, `clean` | Less than 8 ms on Apple M1 |
| Same, `sketch` | Less than 12 ms (cache Rough.js paths for each element shape and seed) |

Cache rules:

- Cache Rough.js paths by `(type, width, height, seed, roughness, strokeWidth)`.
- Cache text layout by `(text, font, size, maxWidth)`.
- Cache connector routes by the bound element boxes. Rebuild only if a box changes.
