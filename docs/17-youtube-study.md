# 17 — Study: videos for YouTube

Status: study and plan, 2026-10-21. Source: owner feedback on the showcase video (e2ee.mp4), a study of explainer channels, and pacing guides.

## 1. Owner feedback on the showcase video

| # | Problem | Cause |
|---|---|---|
| F1 | The reader looks at the diagram, then reads text below it, then looks at the diagram again. | The narration text is in a band below the diagram, far from the change it tells about. |
| F2 | A step does not explain itself. | One step has many changes (3 to 5 actions with different targets). |
| F3 | The "send message" animation is too fast. | The flow dot moves in 600 ms. The message text does not type before it moves. |
| F4 | Too much glow. | The neon theme puts a glow on all shapes, and the script uses the glow effect in 7 steps. |
| F5 | Arrows: the user wants a line, a line with an arrow (either direction), or a line with two arrows. | The arrowheads are in two lists (Start, End) in the properties. That is hard to find. |
| F6 | In and out of each element on the timeline. | The timeline shows actions, not the time that each element is on the screen. |

## 2. What good explainer channels do

These are patterns, not copies. We make our own tools for them.

1. **One idea, one step.** The viewer sees one change at a time. Example: "Alice and Bob" → "A server" → "Alice types a message" → "The message goes to the server".
2. **Text next to the change.** A short line of text shows at the element that changes, or in one fixed place near the diagram (top-left title line). The eye does not jump.
3. **Text that types, then motion.** First the viewer reads the message (it types in a bubble). Then the bubble moves. Motion that the viewer must follow is slow: 1.2 s to 2 s for a send.
4. **Calm color.** A neutral background (near-black or off-white), one accent color, and one or two state colors (green = safe, red = danger). No glow on all shapes. Emphasis is a short, single effect on one element.
5. **The diagram stays.** Elements stay in the same place across steps, so the viewer builds a picture. A new element comes in near the elements it connects to.
6. **Pace.** About 1 s of reading time for each 2 to 3 words on screen, and 3 to 4 s minimum for a step with text. Narration is about 150 words per minute. A complex topic can have 50 to 100 steps.
7. **Readable on a phone.** Body text 36 px or more at 1080p, titles 56 px or more. High contrast.
8. **Familiar widgets.** Chat bubbles, phones, browser windows, terminals, lock and key icons, a packet or envelope that moves, labels on arrows, a stamp ("encrypted", "200 OK").

Trends in 2026: light frames and calm palettes, product screens mixed with simple drawings, hand-made textures (we have the sketch style), and kinetic type as one beat, not as the whole video.

## 3. Plan

Each item is one PR. Each item is a usable workflow in the editor, and an operation for agents.

| # | Item | Fixes |
|---|---|---|
| P1 | Done. No glow by default in the neon theme. Arrow type control: Line, →, ←, ↔ (one click). The arrow tool remembers the last type. | F4, F5 |
| P2 | Done. **Send along an arrow**: a motion action that moves an element along a connector route. Quick action "Send" in the Actions tab. Default 1.6 s, ease-in-out. | F3 |
| P3 | Done. **Message build**: Insert → Message. Choose the sender, the receiver, the arrow, and the text. It makes a bubble at the sender, a step that types the text, and a step that sends it along the arrow. | F2, F3 |
| P4 | Done. **Step caption**: each step can have a caption (one short line). It shows in one fixed place (top, near the diagram), it types in, and the next caption replaces it. Lint warns if the step is too short to read the caption. | F1, F2 |
| P5 | Done. **Layers view in the timeline**: one bar for each element, from its enter to its exit. Drag the ends to change the enter and exit time. Click a bar to select the element. | F6 |
| P6 | Done (anivo-demo/gen_e2ee2.py, 30 steps). New showcase video with the new tools: Alice, Bob, a server; plain network first, then encryption, one idea for each step. | All |

## 4. Done after the plan

- Widgets for explainers: packet (header and body), stamp (ENCRYPTED, 200 OK), envelope, lock badge.
- Soft colors in all themes: `purple-soft`, `teal-soft`.
