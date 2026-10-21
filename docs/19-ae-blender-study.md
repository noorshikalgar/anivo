# 19 — Study: what to take from After Effects and Blender

Status: study and build list, 2026-10-22. All items R1–R13 are built (PRs #117–#120). Owner request: study After Effects and Blender, compare with Anivo, and make a list of things to take as a reference (not copies). Then build the list, one item at a time.

## 1. Where Anivo is now

- One timeline on global time: steps as sections, a track for each element, action blocks, keys, property rows (docs/18).
- Record (K) and ◆ buttons; static edits when Record is off; motion path with key dots on the canvas; hold and preset easing; many keys at once; copy and paste keys.
- Steps, captions, sends along arrows, message builds, widgets, voice and captions, agents through the CLI and MCP.

## 2. What the two tools do well

| Tool | Feature | Why a creator needs it | Our version |
|---|---|---|---|
| After Effects | Easy Ease (F9), ease in, ease out | One key press makes motion look natural. | **F9** easy ease, **Shift+F9** ease in, **Ctrl+Shift+F9** ease out, on the selected keys or blocks. |
| After Effects | Graph editor (speed and value curves) | Exact control of how a move starts and stops. | A **curve editor** for one key or block: two bezier handles that you drag, with presets. The schema has `cubicBezier` already. |
| After Effects | Parenting (pick whip) | A label rides with a moving packet. | **Follow**: element B follows the motion of element A (a "follow" action, with an offset). |
| After Effects | Sequence layers (keyframe assistant) | Many elements come in one after the other in one click. | **Sequence**: the selected elements enter one after the other, in canvas order or selection order. |
| After Effects | Work area and preview loop | Watch one part again and again while you tune it. | A **loop region** on the ruler: drag to set it; Space plays only that part, in a loop. Export can use it. |
| After Effects | Anchor point | Scale and turn from a corner or the bottom, not only the center. | An **origin** property (9 points) for scale, pop, and turn. |
| After Effects | Shy layers, solo | A long scene has many tracks. | Timeline filter: **only animated** tracks, or **only the selection**. |
| After Effects | Motion blur | Fast moves look smooth. | Later: a light motion blur for fast moves in export. |
| After Effects | Text animators (per word) | Explainers highlight words. | Later: **per-word** reveal and a word highlight. |
| Blender | `I` inserts a key, `Alt+I` deletes it | Keys in one key press, no hunting for a button. | **I**: a key at the playhead for the selected elements (the properties that changed, or position). **Alt+I**: delete the keys at the playhead. |
| Blender | Onion skin (Grease Pencil) | See where the element was and will be. | **Onion skin**: faint copies of the selected element at its previous and next keys. |
| Blender | Dope sheet: box select (B), grab (G), scale (S) of keys | Retime a group of keys in one move. | **Box select** keys in the timeline; **Alt + drag** the end of the selection to stretch or shrink its times. |
| Blender | Snapping in the timeline | Keys line up with each other and with beats. | **Snap** to the playhead, step borders, other keys, and block edges (hold Shift to turn it off). |
| Blender | Frame step keys | Exact timing, frame by frame. | **←/→** one frame, **Shift** ten frames, **Home/End**, **↑/↓** previous and next key, when the timeline has focus. |
| Blender | Workspaces (Layout, Animation) | The right panels for the job. | **Design / Animate** switch: Design hides the timeline and Record; Animate opens them. |

What we do not take: expressions, drivers, node editors, the NLA editor, 3D. They add power that explainer makers seldom need, and they make the tool hard to learn.

## 3. Build list (in this order)

| # | Item | Size |
|---|---|---|
| R1 | Done. `I` insert key, `Alt+I` delete keys at the playhead | S |
| R2 | Done. Timeline keys: frame step, Home/End, previous and next key; snapping when you drag keys and blocks | M |
| R3 | Done. Easy Ease shortcuts (F9 family) and a curve editor for one key or block | M |
| R4 | Done. Timeline filter: only animated, only selected | S |
| R5 | Done. Onion skin for the selected element | M |
| R6 | Done. Follow: an element follows another element's motion | M |
| R7 | Done. Loop region on the ruler (preview loop; export range) | M |
| R8 | Done. Box select keys; Alt + drag to stretch their times | M |
| R9 | Done. Sequence: the selected elements enter one after the other | S |
| R10 | Done. Design / Animate workspace switch | S |
| R11 | Done. Origin (anchor) for scale and turn | M |
| R12 | Done. Per-word text reveal and word highlight | M |
| R13 | Done. Motion blur for fast moves (export) | L |

After this list: the installable desktop app (a PWA, like Figma): portable and light.
