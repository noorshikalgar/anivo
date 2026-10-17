# 01 — Glossary

Each term has one meaning in Anivo. Use these terms in code, documents, UI text, and prompts.
Do not use the words in the "Do not use" column for the same meaning.

## Core terms

| Term | Meaning | Do not use |
|---|---|---|
| **Scene** | One Anivo document. It contains elements, steps, audio, and settings. It makes one video. | project, file, board, doc |
| **Canvas** | The infinite 2D area where the user draws elements. | stage, artboard |
| **Element** | One visible object on the canvas: a shape, text, connector, icon, image, code block, or group. | node, object, item, layer |
| **Shape** | An element with a geometry: rectangle, ellipse, diamond, or line. | box (in code), figure |
| **Connector** | An element that joins two elements or two points. An arrow is a connector with an arrowhead. | edge, link, wire |
| **Binding** | The attachment of a connector end to an element. If the element moves, the connector end moves. | anchor, snap |
| **Group** | An element that contains other elements. Its children move together. | frame, container |
| **Icon** | A vector image from an icon pack, for example the Kubernetes pod icon. | sticker, glyph |
| **Code block** | An element that shows source code with syntax colors. | snippet |
| **Base state** | The properties of all elements before step 1 starts. | initial frame |
| **Step** | One unit of change in the video. It has a sequence position, a duration, and actions. | slide, keyframe, scene |
| **Action** | One animated change inside a step, for example "fade in element `lb`". | animation, effect, tween |
| **Action type** | The kind of action: `enter`, `exit`, `morph`, `emphasis`, `flow`, `camera`, `counter`, `code`, `wait`. | |
| **Effect** | The visual form of an `enter`, `exit`, or `emphasis` action, for example `draw-on`, `pop`, `pulse`. | preset |
| **State** | The full set of element properties at one time. | snapshot |
| **Morph** | An automatic transition of properties from the state at the end of one step to the state of the next step. | magic move, tween |
| **Flow** | Particles that move along a connector to show data or requests. | packets (in code), dots |
| **Camera** | The view rectangle that the video shows. A camera action moves or zooms it. | viewport (in video context) |
| **Easing** | The curve that controls speed during an action. | interpolation curve |
| **Timeline** | The ordered list of steps and their times in milliseconds. | sequence |
| **Playhead** | The current time on the timeline. | cursor (in time context) |
| **Frame** | One still image of the video at one time. Only this meaning. | |
| **Render** | To calculate and draw one frame from the scene and a time. | paint, draw (in engine context) |
| **Export** | To make an output file (MP4, WebM, GIF, PNG, SRT) from a scene. | save as, publish |
| **Style** | The visual mode of the scene: `sketch` (hand-drawn) or `clean` (sharp). | theme |
| **Theme** | A named set of colors and fonts. A theme is different from a style. | palette (for the full set) |
| **Voiceover** | The main audio track with speech. | narration, VO |
| **Cue** | A time mark on the voiceover that starts a step. | marker, anchor |
| **Script** | The text of the voiceover. Each line can link to one step. | transcript (for the source text) |
| **Transcript** | Text with word times that speech recognition makes from the voiceover. | |
| **Caption** | A subtitle line in the exported video or in an SRT file. | subtitle |

## Agent terms

| Term | Meaning | Do not use |
|---|---|---|
| **Operation** | One change to a scene, sent to the operation bus. Example: `element.add`. All edits are operations. | command, mutation, patch |
| **Transaction** | A list of operations that apply together. Undo removes a full transaction. | batch |
| **Operation bus** | The single entry point that validates and applies operations. | dispatcher, store |
| **Anivo Script** | The text language for scenes. File extension: `.anivo.txt`. | DSL (in UI text) |
| **Agent** | An AI program that uses Anivo through the CLI, the MCP server, or the AI panel. | bot, assistant |
| **Author** | The person or agent that made an operation. Each operation records its author. | actor, user (for agents) |
| **Preview** | A PNG image of one frame. An agent uses it to see the result. | thumbnail, screenshot |
| **Lint** | A check that finds layout problems: overlap, text overflow, low contrast, elements off camera. | validate (for layout) |
| **Bridge** | The local connection between the MCP server and a running editor. | tunnel, socket |
| **Review mode** | The editor mode where the user accepts or rejects the operations of an agent. | diff mode |

## Delivery terms

| Term | Meaning |
|---|---|
| **Web app** | The editor that runs in a browser. It is also the Docker image. |
| **Desktop app** | The editor in an Electron window, with native capabilities. |
| **CLI** | The `anivo` command-line program. It renders, exports, lints, and runs the MCP server. |
| **Player** | The `<anivo-player>` web component. It plays a scene in a web page. |
| **Server** | The optional backend for share links, collaboration, and server render. |

## Words with a fixed spelling

- Anivo (product name). `anivo` (CLI command). `@anivo/*` (npm scope: create the organization before the first publish — see [14](14-risks-and-open-questions.md)).
- MCP (Model Context Protocol). Write "MCP server", not "MCP".
- MP4, WebM, GIF, PNG, SVG, SRT, WAV, MP3 (all capitals except WebM).
