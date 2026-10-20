# 05 — Scene model

## Design rules

1. **Store elements in a map by ID.** Do not store them in an array. A map makes merge and collaboration easy.
2. **Store the draw order as a fractional index** (`z`, a string). Insert between two elements with no renumber.
3. **Store only the base state in `elements`.** Steps store changes. The engine calculates the state at each time.
4. **Use readable IDs.** Examples: `user`, `lb`, `pod-1`. The ID pattern is `^[a-z][a-z0-9-]{0,47}$`. Agents use these IDs.
5. **Use one unit.** Positions and sizes are in scene pixels. Times are in milliseconds (integers).
6. **Make every field explicit in memory, optional on disk.** The loader fills defaults. The writer omits default values. This keeps files small and diffs clean.
7. **Do not store derived data.** Do not store connector paths, text layout, or Rough.js paths. The renderer calculates them.
8. **Validate with Zod at each boundary.** Boundaries are file load, operation input, MCP input, and CLI input.

## Top-level structure

```ts
interface Scene {
  schemaVersion: number;          // integer, starts at 1
  id: string;                     // ULID
  meta: { title: string; createdAt: string; updatedAt: string; authors: string[] };
  settings: SceneSettings;
  elements: Record<ElementId, Element>;
  steps: Step[];                  // ordered
  audio: AudioTrack[];            // 0..n; kind "voiceover" maximum 1
  script: ScriptLine[];           // 0..n
  assets: Record<AssetId, AssetRef>;
  comments: { id: string; target: { kind: "element" | "step"; id: string }; author: string; text: string; at: string; resolved: boolean; replyTo?: string }[];
}

interface SceneSettings {
  style: "sketch" | "clean";
  theme: string;                  // built-in name, or the name of `customTheme`
  customTheme?: { name: string; base: string; dark?: boolean; tokens: Record<string, string>; strokeWidth?: number; cornerRadius?: number };
                                  // a built-in theme with changed colors; also the theme file format
  background: { kind: "solid" | "grid" | "dots" | "transparent"; color?: string };
  video: { width: number; height: number; fps: 24 | 30 | 60 };
  camera: { x: number; y: number; width: number; height: number }; // base camera
  defaults: { stepDurationMs: number; enterEffect: EffectName; easing: EasingName; defaultIconPack: string }; // "lucide" | "fluent" | …
}
```

## Elements

All elements share a base.

```ts
interface ElementBase {
  id: ElementId;
  type: ElementType;
  z: string;                     // fractional index
  parentId?: ElementId;          // set if the element is in a group
  x: number; y: number;          // top-left, scene pixels
  width: number; height: number;
  rotation: number;              // degrees
  opacity: number;               // 0..1
  visible: boolean;              // visible in the base state (before step 1)
  locked: boolean;               // editor only
  seed: number;                  // Rough.js seed, fixed at create time
  style: Partial<ElementStyle>;  // overrides of the theme
  label?: TextContent;           // text inside a shape
  meta?: Record<string, string>; // free key-value data, for agents and plugins
}

type ElementType =
  | "rectangle" | "ellipse" | "diamond" | "line"
  | "text" | "connector" | "group" | "icon" | "image"
  | "code" | "table";

interface ElementStyle {
  fill: string; stroke: string; strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  cornerRadius: number;
  fontFamily: string; fontSize: number; fontWeight: 400 | 500 | 700;
  textColor: string; textAlign: "left" | "center" | "right";
  roughness: number;             // sketch style only, 0..3
}
```

Colors are theme tokens (`"accent"`, `"danger"`, `"surface"`) or hex values (`"#378ADD"`). Tokens are preferred. A theme change then updates the element.

### Connector

```ts
interface Connector extends ElementBase {
  type: "connector";
  route: "straight" | "elbow" | "curved";
  start: ConnectorEnd;
  end: ConnectorEnd;
  waypoints?: { x: number; y: number }[];
  startHead: Head; endHead: Head;
}

type ConnectorEnd =
  | { kind: "bound"; elementId: ElementId; side?: "top" | "right" | "bottom" | "left" | "auto"; offset?: number }
  | { kind: "free"; x: number; y: number };
```

`x`, `y`, `width`, and `height` of a connector are derived bounds. The writer omits them.

### Other element types

| Type | Extra fields |
|---|---|
| `text` | `content: TextContent`, `autoSize: boolean` |
| `group` | `childOrder` is not stored. Children have `parentId`. |
| `icon` | `pack: string`, `name: string` (example: `pack: "lucide", name: "server"`) |
| `image` | `assetId: AssetId` (an `image/*` asset), `fit: "contain" \| "cover" \| "fill"`. PNG, JPEG, WebP, SVG. Maximum 20 MB. |
| `code` | `language: string`, `code: string`, `lineNumbers: boolean`, `theme: string` |
| `table` | `rows: number` (1–50), `cols: number` (1–20), `header: boolean`. Each cell is a `text` child with ID `<tableId>-r<row>c<col>` (from 1). The table draws the grid. A change of the table box, rows, or columns moves, adds, or removes cells. An action on the table applies to the grid and all cells. |

`TextContent` is `{ text: string; runs?: { start: number; end: number; bold?: boolean; code?: boolean; color?: string }[] }`.

## Steps and actions

```ts
interface Step {
  id: StepId;                    // readable, example "s-traffic"
  title: string;
  trigger: { kind: "auto" } | { kind: "click" } | { kind: "cue"; audioId: string; atMs: number };
  durationMs?: number;           // omitted = calculated from actions
  holdMs: number;                // hold the end state, default 500
  actions: Action[];
  notes?: string;                // speaker notes
  scriptLineId?: string;
}

interface ActionBase {
  id: string;
  type: ActionType;
  targets: ElementId[];          // one or more
  delayMs: number;               // from step start
  durationMs: number;
  easing: EasingName | { cubicBezier: [number, number, number, number] } | { spring: { stiffness: number; damping: number; mass: number } };
  staggerMs?: number;            // delay between targets
}

type Action =
  | ActionBase & { type: "enter"; effect: EnterEffect; params?: EffectParams }
  | ActionBase & { type: "exit"; effect: EnterEffect; params?: EffectParams }
  | ActionBase & { type: "morph"; to: Partial<MorphableProps> }
  | ActionBase & { type: "emphasis"; effect: EmphasisEffect; params?: EffectParams }
  | ActionBase & { type: "flow"; flow: FlowParams }
  | ActionBase & { type: "camera"; camera: CameraParams }
  | ActionBase & { type: "counter"; counter: { from: number; to: number; format: string; decimals: number } }
  | ActionBase & { type: "code"; code: { op: "highlight" | "type" | "diff"; lines?: [number, number]; newCode?: string } }
  | ActionBase & { type: "wait" };
```

See [06](06-animation-engine.md) for the effects, flow parameters, and camera parameters.

## Audio and script

```ts
interface AudioTrack {
  id: string; kind: "voiceover" | "music" | "sfx";
  assetId: AssetId; startMs: number; gainDb: number;
  trimStartMs: number; trimEndMs?: number;
  transcript?: { words: { text: string; startMs: number; endMs: number }[] };
}

interface ScriptLine { id: string; text: string; stepId?: StepId }
```

## Assets

```ts
interface AssetRef {
  id: AssetId;                   // SHA-256 of the content, first 16 hex characters
  mime: string; bytes: number;
  path: string;                  // relative path in the ZIP or folder, example "assets/3f9a….png"
}
```

Content addressing removes duplicate assets. The same image used twice is stored once.

## File formats

| Format | Extension | Contents | Use |
|---|---|---|---|
| Archive | `.anivo` | ZIP: `scene.json`, `assets/`, `audio/`, `preview.png` | Default save. Easy to share. |
| Single JSON | `.anivo.json` | `scene.json` with assets as base64 data URLs | Embed in docs. Agent output. Maximum 10 MB. |
| Folder | `<name>.anivo/` | Same layout as the archive, not compressed | Git. Clean diffs. |
| Anivo Script | `.anivo.txt` | Text language | Agents. Manual edit. See [09](09-agent-interface.md). |

> **CAUTION:** Write JSON with a stable key order and a 2-space indent. Write elements sorted by `z`, then by `id`. If the order changes on each save, Git diffs become useless.

## Schema versions and migrations

1. Each breaking change to the format increases `schemaVersion` by 1.
2. Write a pure migration function `migrate_N_to_N+1(scene)` for each version.
3. The loader applies migrations in sequence until the current version.
4. Keep a fixture file for each old version in `packages/schema/fixtures/`. A test loads each fixture.
5. If a file has a `schemaVersion` greater than the current version, open it read-only. Show: "This scene is from a newer version of Anivo. Update Anivo to edit it."

> **WARNING:** Do not remove a migration. Old files must always open.

## Published schema

- The `@anivo/schema` package exports Zod schemas and TypeScript types.
- The build generates JSON Schema files from the Zod schemas.
- The CLI command `anivo schema` prints the JSON Schema. Agents and other tools use it.
- The schema has a `description` on each field. The descriptions are in STE. Agents read them.

## Example: Example A, steps 1 to 4 (single JSON, defaults omitted)

```json
{
  "schemaVersion": 1,
  "id": "01JC8Q3X9ZK4M2N7P5R6T8V0W1",
  "meta": { "title": "How a load balancer works" },
  "settings": { "style": "clean", "theme": "slate-dark", "video": { "width": 1920, "height": 1080, "fps": 60 } },
  "elements": {
    "user":  { "type": "icon", "z": "a0", "pack": "lucide", "name": "user", "x": 120, "y": 480, "width": 120, "height": 120, "label": { "text": "User" } },
    "lb":    { "type": "rectangle", "z": "a1", "x": 600, "y": 490, "width": 260, "height": 100, "style": { "fill": "accent-soft" }, "label": { "text": "Load balancer" } },
    "pod-1": { "type": "rectangle", "z": "a2", "x": 1200, "y": 240, "width": 220, "height": 90, "label": { "text": "pod-1" } },
    "pod-2": { "type": "rectangle", "z": "a3", "x": 1200, "y": 495, "width": 220, "height": 90, "label": { "text": "pod-2" } },
    "pod-3": { "type": "rectangle", "z": "a4", "x": 1200, "y": 750, "width": 220, "height": 90, "label": { "text": "pod-3" } },
    "c-user-lb": { "type": "connector", "z": "a5", "start": { "kind": "bound", "elementId": "user" }, "end": { "kind": "bound", "elementId": "lb" }, "endHead": "arrow" },
    "c-lb-1": { "type": "connector", "z": "a6", "start": { "kind": "bound", "elementId": "lb" }, "end": { "kind": "bound", "elementId": "pod-1" }, "endHead": "arrow" },
    "c-lb-2": { "type": "connector", "z": "a7", "start": { "kind": "bound", "elementId": "lb" }, "end": { "kind": "bound", "elementId": "pod-2" }, "endHead": "arrow" },
    "c-lb-3": { "type": "connector", "z": "a8", "start": { "kind": "bound", "elementId": "lb" }, "end": { "kind": "bound", "elementId": "pod-3" }, "endHead": "arrow" }
  },
  "steps": [
    { "id": "s-user", "title": "User appears", "actions": [
      { "id": "a1", "type": "enter", "effect": "draw-on", "targets": ["user"], "durationMs": 800 } ] },
    { "id": "s-lb", "title": "Load balancer", "actions": [
      { "id": "a2", "type": "enter", "effect": "pop", "targets": ["lb"], "durationMs": 500 },
      { "id": "a3", "type": "enter", "effect": "draw-on", "targets": ["c-user-lb"], "delayMs": 300, "durationMs": 600 } ] },
    { "id": "s-pods", "title": "Pods fan out", "actions": [
      { "id": "a4", "type": "enter", "effect": "draw-on", "targets": ["c-lb-1", "c-lb-2", "c-lb-3"], "durationMs": 600 },
      { "id": "a5", "type": "enter", "effect": "pop", "targets": ["pod-1", "pod-2", "pod-3"], "delayMs": 400, "durationMs": 450, "staggerMs": 150 } ] },
    { "id": "s-traffic", "title": "Traffic flows", "holdMs": 3000, "actions": [
      { "id": "a6", "type": "flow", "targets": ["c-user-lb"], "durationMs": 3000, "flow": { "rate": 2 } },
      { "id": "a7", "type": "flow", "targets": ["c-lb-1", "c-lb-2", "c-lb-3"], "durationMs": 3000, "flow": { "rate": 2, "distribute": "round-robin", "chainFrom": "c-user-lb" } } ] }
  ]
}
```

> **NOTE:** In this example, all elements have `visible: false` in the base state, because each element has an `enter` action. The loader sets `visible: false` automatically for an element whose first action is `enter`. See [06](06-animation-engine.md#visibility-rule).

## Widgets

A widget is a ready-made group of plain elements, for example a browser window or a stat card. There is no widget element type: the insert makes a group and its parts, so the user can change each part. The part IDs are `<widget ID>-<part>` (for example `web-url`).

- Built-in widgets: browser, phone, server, database, chat, terminal, stat, step-badge, progress, callout, user-card (`packages/ops/src/widgets.ts`). Each has texts with defaults, and it scales to a size.
- Anivo Script: `widget web browser at=100,100 size=800x520 url="https://example.com"`.
- Editor: the Widgets button of the toolbar shows the gallery. **Save as widget** keeps a selection as a user widget in this browser; insert it in any scene.
