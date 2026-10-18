# 09 — Agent interface

## Principle

A person and an agent use the same system. All changes to a scene go through the **operation bus**.
The editor UI, the CLI, the MCP server, the AI panel, undo/redo, and collaboration all send operations.
No code path changes a scene in a different way.

```
 Editor UI ──┐
 AI panel ───┤
 CLI ────────┼──► Operation bus ──► validate ──► apply ──► new Scene ──► history, autosave, bridge events
 MCP server ─┤        ▲
 Bridge ─────┘        └── Anivo Script compiler (text → operations)
```

## Why agents need special design

An LLM agent has these known weaknesses for diagram work:

| Weakness | Anivo solution |
|---|---|
| Bad at pixel coordinates | Relative placement and auto layout operations. The agent says "right of `lb`, gap 120". |
| Cannot see the result | `anivo_preview` returns a PNG. The agent examines the image. |
| Does not see layout problems | `anivo_lint` returns a list of problems with element IDs and fix hints. |
| Long JSON uses many tokens | Anivo Script is short. Example A is approximately 25 lines. |
| Invents IDs or properties | Strict schema validation. Each error has a path and a fix hint. The error lists the valid values. |
| Loses track of the scene | `anivo_scene_summary` returns a compact text outline with IDs, not the full JSON. |
| Makes many small calls | Transactions. One call applies many operations together. |

## Operations

Each operation is a JSON object with an `op` field. Operations are versioned with the schema.

### Element operations

| Operation | Purpose |
|---|---|
| `element.add` | Add an element. The `id` is optional. If it is missing, Anivo makes a readable ID from the label (`"Load balancer"` → `load-balancer`). |
| `element.update` | Change properties of the base state. |
| `element.remove` | Remove elements. Also removes bound connector ends (they become `free`) and actions with no targets. |
| `element.place` | Relative placement: `{ id, rightOf \| leftOf \| above \| below: id, gap, align: "start" \| "center" \| "end" }`. |
| `element.connect` | Add a connector between two elements: `{ from, to, route, label, endHead }`. |
| `element.group` / `element.ungroup` | Group operations. |
| `element.reorder` | Change `z`: `front`, `back`, `forward`, `backward`, or `{ above: id }`. |
| `element.rename` | Change an ID. Updates all references (bindings, actions, groups). |
| `layout.apply` | Auto layout: `{ ids, kind: "row" \| "column" \| "grid" \| "tree" \| "layered", gap, cols, direction }`. Arrows between the elements give the order for `tree` and `layered`. The top-left corner of the elements stays in place. In Anivo Script: `layout web, api, db layered`. |

### Step and action operations

| Operation | Purpose |
|---|---|
| `step.add` | Add a step at an index. |
| `step.update` | Change title, trigger, duration, hold, notes. |
| `step.remove` | Remove a step. |
| `step.move` | Change the step index. |
| `action.add` | Add an action to a step. Defaults fill missing timing. |
| `action.update` / `action.remove` | Change or remove an action. |

### Scene operations

| Operation | Purpose |
|---|---|
| `scene.settings` | Change style, theme, video size, fps, background. |
| `audio.add` / `audio.update` / `audio.remove` | Audio tracks. |
| `script.set` | Set the script lines. |
| `script.align` | Run alignment (see [08](08-audio-and-captions.md)). |

### Transaction format

```json
{
  "author": { "kind": "agent", "name": "claude-code" },
  "label": "Add load balancer and pods",
  "ops": [
    { "op": "element.add", "type": "rectangle", "id": "lb", "label": "Load balancer" },
    { "op": "element.place", "id": "lb", "rightOf": "user", "gap": 200, "align": "center" },
    { "op": "element.connect", "from": "user", "to": "lb", "endHead": "arrow" }
  ]
}
```

### Bus rules

1. Validate all operations of a transaction before you apply any operation. If one operation is not valid, apply none.
2. Apply operations in sequence. A later operation can refer to an ID from an earlier operation in the same transaction.
3. Return the result: new IDs, warnings, and the new scene version number.
4. Record the transaction in the history with its author and label.
5. Use optimistic version checks. A transaction can include `baseVersion`. If the scene version is different and the transaction touches the same elements, return `conflict`. If the elements are different, apply it.

### Error format

```json
{
  "ok": false,
  "error": {
    "code": "unknown-element",
    "message": "Element 'pod-4' does not exist.",
    "path": "ops[2].targets[0]",
    "hint": "Use one of: pod-1, pod-2, pod-3. Or add 'pod-4' with element.add first."
  }
}
```

Write each `message` and `hint` in STE (see [00](00-writing-rules.md)). Agents read them.

## Anivo Script

Anivo Script is a text language for a full scene. It compiles to operations. It prints from a scene.

### Goals

1. Short: Example A in less than 30 lines.
2. Readable by a person with no documentation.
3. Easy for an LLM to write: few symbols, no nesting deeper than 2 levels, no required coordinates.
4. Round trip: `print(parse(text))` gives the normalized text. `parse(print(scene))` gives the same scene.

### Example A in Anivo Script

```
scene "How a load balancer works" style=clean theme=slate-dark size=1920x1080 fps=60

icon user lucide:user "User"
box lb "Load balancer" fill=accent-soft      right-of=user gap=240
column pods right-of=lb gap=240 spacing=60
  box pod-1 "pod-1"
  box pod-2 "pod-2"
  box pod-3 "pod-3"

arrow user -> lb
arrow lb -> pod-1, pod-2, pod-3

step "User appears"
  enter user draw-on
step "Load balancer"
  enter lb pop
  enter user->lb draw-on +300ms
step "Pods fan out"
  enter lb->pod-* draw-on
  enter pod-* pop +400ms stagger=150ms
step "Traffic flows" hold=3s
  flow user->lb rate=2
  flow lb->pod-* round-robin chain=user->lb
step "Pod 3 crashes"
  morph pod-3 fill=danger label="pod-3 crashed"
  shake pod-3
  flow lb->pod-* round-robin skip=lb->pod-3
step "Self-healing"
  morph pod-3 fill=surface label="pod-3 (new)"
  enter note fade

caption note "Replaced automatically"
```

### Language rules

| Rule | Example |
|---|---|
| One statement on one line | `box lb "Load balancer"` |
| Indent of 2 spaces marks a child of a container or a step | |
| An ID is the first bare word after the element kind | `box lb` |
| A quoted string is the label | `"Load balancer"` |
| Properties are `key=value` | `fill=accent-soft` |
| Connector reference is `from->to` | `user->lb` |
| `*` matches IDs with a prefix | `pod-*` |
| Time values have units | `300ms`, `1.5s` |
| `+300ms` after an action is its delay | |
| Comments start with `#` | |
| Coordinates are optional | `at=600,490` is allowed but not required. With no `at`, the diagram is centered in the camera |
| Declare elements at the top level, not inside a step | A step contains actions only |

### Element kinds in Anivo Script

`box`, `ellipse`, `diamond`, `text`, `icon`, `image`, `code`, `table`, `group`, `row`, `column`, `grid`, `arrow`, `line`, `caption`.

`row`, `column`, and `grid` make a group with an automatic layout. `caption` makes a text element with the caption style.

### Action statements

`enter <targets> <effect>`, `exit <targets> <effect>`, `morph <targets> key=value…`, `pulse|shake|glow|flash|wiggle|highlight|focus <targets>`, `flow <connectors> …`, `camera zoom-to <targets> [padding=80]`, `camera pan at=x,y size=WxH`, `camera reset`, `count <target> from=0 to=120 format="{n} req/s" [decimals=0]`, `code <target> highlight=3-5`, `wait 1s`.

### Parser requirements

1. Write a hand-written recursive descent parser. Do not use a parser generator. Error messages must be clear.
2. Each error has a line number, a column, the problem, and a fix hint.
3. The parser does not stop at the first error. It reports all errors, maximum 20.
4. The compiler resolves relative placement and layout after all elements are known.

## CLI

The `anivo` command is in the `@anivo/cli` npm package. After phase 6, it also ships inside the desktop app.

| Command | Purpose |
|---|---|
| `anivo new <file> [--template <name>]` | Make a new scene |
| `anivo apply <scene> <script.anivo.txt \| ops.json>` | Apply Anivo Script or a transaction to a scene |
| `anivo print <scene>` | Print the scene as Anivo Script |
| `anivo summary <scene>` | Print a compact outline: elements, steps, total time |
| `anivo validate <scene>` | Schema check. Exit code 1 if not valid |
| `anivo lint <scene> [--format json]` | Layout check. Exit code 1 if there are errors |
| `anivo preview <scene> --step <n> [--at end\|start\|<ms>] [--out file.png] [--debug]` | Render one frame to PNG |
| `anivo contact-sheet <scene> --out sheet.png` | One PNG with the end state of each step in a grid |
| `anivo render <scene> --out video.mp4 [--format …] [--size …] [--fps …] [--range …]` | Export video |
| `anivo convert <in> <out>` | Convert between `.anivo`, `.anivo.json`, folder, Anivo Script, and from `.excalidraw` or Mermaid |
| `anivo schema [--ops \| --scene]` | Print the JSON Schema |
| `anivo icons search <query>` | Search icon packs |
| `anivo mcp [--attach] [--root <dir>]` | Start the MCP server on stdio |
| `anivo serve [--port 5173]` | Serve the web app locally and open a scene |

Global flags: `--json` (machine output for all commands), `--quiet`, `--no-color`.

> **NOTE:** `contact-sheet` is important for agents. One image shows all steps. The agent examines the full video with one tool call.

## MCP server

### Transport

| Mode | Command | Use |
|---|---|---|
| stdio, file mode | `anivo mcp --root ./videos` | Headless agents. Scenes are files under `--root`. |
| stdio, attach mode | `anivo mcp --attach` | The MCP server connects to a running editor through the bridge. The agent edits the scene that the user sees. |
| Streamable HTTP | `anivo-server` (remote MCP endpoint), or the desktop app after phase 6 | Clients that do not run local commands. The desktop app binds to `127.0.0.1` only. |

### Tools

| Tool | Input | Output |
|---|---|---|
| `anivo_guide` | — | The scene-agent guide (short version of [prompts/scene-agent.md](../prompts/scene-agent.md)) |
| `anivo_scene_create` | `path`, `title`, `template?`, `settings?` | Scene ID, path |
| `anivo_scene_open` | `path` | Scene ID |
| `anivo_scene_summary` | `scene` | Compact text outline |
| `anivo_scene_get` | `scene`, `format: "script" \| "json"`, `ids?` | Scene content (full or partial) |
| `anivo_script_apply` | `scene`, `script`, `mode: "replace" \| "append"` | Result, warnings, lint summary |
| `anivo_ops_apply` | `scene`, `transaction` | Result, warnings, lint summary |
| `anivo_lint` | `scene` | List of problems |
| `anivo_preview` | `scene`, `step`, `at?`, `debug?`, `width?` | PNG image (MCP image content) |
| `anivo_contact_sheet` | `scene` | PNG image |
| `anivo_export` | `scene`, `format`, `out`, `size?`, `fps?`, `range?`, `captions?` (`bottom`, `top`) | File path, size, duration |
| `anivo_import` | `scene`, `file?` or `mermaid?`, `steps?` | Element and step count, summary |
| `anivo_image_add` | `scene`, `file`, `id?`, `x?`, `y?`, `width?`, `fit?` | Element ID, asset ID |
| `anivo_transcribe` | `scene`, `language?`, `align?` | Word count, aligned lines |
| `anivo_captions` | `scene`, `format: "srt" \| "vtt"`, `out?` | Caption text |
| `anivo_icons_search` | `query`, `pack?` (`lucide`, `fluent`, …), `limit?` | Icon names with packs |
| `anivo_templates_list` | — | Template names and descriptions |
| `anivo_schema` | `kind: "ops" \| "scene"` | JSON Schema |
| `anivo_undo` | `scene` | Result |

Rules for tools:

1. Each tool description is in STE. Each description says when to use the tool.
2. Each write tool returns a short lint summary. The agent does not need a separate lint call after each change.
3. `anivo_preview` returns an image with a maximum width of 1280 px. This limits the image token cost.
4. All tools accept `scene` as a path or as a scene ID from `anivo_scene_open`.

### MCP resources and prompts

- Resource `anivo://schema/ops`, `anivo://schema/scene`: JSON Schema.
- Resource `anivo://scene/{id}/script`: current Anivo Script.
- Prompt `explain-concept`: arguments `topic`, `steps`, `style`. It returns a starter message that makes a video.

### File access safety

> **WARNING:** The MCP server in file mode must read and write only inside `--root`. Resolve each path. Reject a path that resolves outside `--root`, including through symbolic links. If you skip this check, an agent can overwrite any file of the user.

## Bridge (agent live in the editor)

### Desktop app (phase 6, deferred)

1. The user opens Settings → Agents → "Allow agents to connect".
2. The desktop app starts an MCP server (Streamable HTTP) on `127.0.0.1` with a random port.
3. The app shows the address and a random token. The app writes them to `~/.anivo/bridge.json` with file mode `0600`.
4. `anivo mcp --attach` reads `bridge.json` and connects.
5. Each connection shows a banner in the editor: "Agent 'claude-code' is connected. Disconnect".

### Web app

1. The user runs `anivo mcp --attach --web` in a terminal. The CLI opens a WebSocket server on `127.0.0.1` and prints a one-time pairing code.
2. In the web app, the user clicks "Connect agent" and enters the pairing code.
3. The web app connects to `ws://127.0.0.1:<port>` (default port 47811) and sends the code in its first message. The code works one time and expires after 5 minutes. When the editor disconnects, the server makes a new code.
4. The agent calls `anivo_bridge_status` to get the code and tells it to the user (the agent starts the server, so the user does not see its output).
5. Attach mode tools have no scene path: `anivo_bridge_status`, `anivo_guide`, `anivo_scene_summary`, `anivo_scene_get`, `anivo_script_apply` (append or replace), `anivo_ops_apply`, `anivo_undo`, `anivo_lint`, `anivo_preview`, `anivo_contact_sheet`, `anivo_export`, `anivo_icons_search`, `anivo_schema`.
6. Allowed origins: `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:8080`, `http://127.0.0.1:8080`, plus `ANIVO_WEB_ORIGINS` (comma-separated) and `--origin`.

> **NOTE:** Chromium browsers can ask the user for "local network access" permission when an HTTPS page connects to `127.0.0.1`. The UI must explain this prompt before the connection.

> **WARNING:** The bridge must check the pairing code or token on each connection. It must accept connections only from `127.0.0.1`. It must check the `Origin` header against the allowed web app origins. If you skip these checks, a malicious web page can control the editor.

### Agent presence in the editor

- The editor shows an agent cursor at the last element that the agent changed.
- New and changed elements show a colored outline for 2 seconds.
- In review mode, the transactions of an agent wait in a queue. The user accepts or rejects each transaction. The canvas shows the pending result with a dashed outline.
- The user can set "Auto-accept for this session".

## AI panel (in the editor)

1. The panel is a chat. The user selects a provider: Anthropic, OpenAI-compatible endpoint, or Ollama.
2. The panel sends the scene summary, the current Anivo Script, the user message, and the scene-agent system prompt to the model.
3. The model uses the same tools as the MCP server (the panel calls them in-process).
4. The panel shows each tool call in a compact form.
5. Default model: the latest Claude Sonnet model. The user can change it.

> **WARNING:** Store API keys only on the user's device. In the desktop app, store them in the OS keychain. In the web app, store them in IndexedDB and tell the user that other browser extensions can read them. Never write a key to a scene file, a log, or a share link.

## Lint rules

| Code | Level | Problem |
|---|---|---|
| `overlap` | warning | Two elements overlap by more than 10% of the smaller area, and they are not in a parent-child relation |
| `text-overflow` | error | Label text does not fit inside its shape |
| `off-camera` | warning | A visible element is outside the camera during a step |
| `low-contrast` | warning | Text contrast is less than 4.5:1 (WCAG AA) |
| `connector-crosses` | info | A connector passes through a shape that it does not connect |
| `step-empty` | warning | A step has no actions |
| `step-overlap` | error | A step ends after the next cue |
| `action-conflict` | warning | Two actions change the same property at the same time |
| `unused-element` | info | An element is never visible |
| `dangling-connector` | warning | A connector is visible while a bound element is not visible |
| `tiny-text` | warning | Text is smaller than 24 px at 1080p |
| `too-fast` | info | A step is shorter than 800 ms with more than 3 actions |
| `script-unmatched` | warning | Alignment did not find script lines in the voiceover transcript |

Each lint result has `code`, `level`, `ids`, `step?`, `message`, and `hint`.

## Agent eval suite

1. Keep 20 fixed prompts in `evals/prompts/`. Examples: "Explain DNS resolution in 6 steps", "Show a Kafka consumer group rebalance".
2. For each prompt, run an agent with the MCP server, from an empty scene.
3. Score each result:
   - Valid scene: pass/fail.
   - Lint errors: 0 is required. Lint warnings: count.
   - Step count within ±1 of the request.
   - A model grader scores the contact sheet from 1 to 5 for clarity, with a fixed rubric.
4. Store the scores. Show a trend chart. Fail the CI job if the mean score decreases by more than 0.5.
