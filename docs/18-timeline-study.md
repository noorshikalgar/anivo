# 18 — Study: the timeline

Status: study and proposal, 2026-10-22. Input: owner feedback, After Effects, Rive, Jitter, Keynote. We take ideas, not copies.

## 1. What the owner saw

1. A message sat on the arrow (part way from the resolver to the root server). The send went up to the resolver first, then down. **Cause:** a send always started at the arrow start. **Fixed** in #112: the path joins the arrow at the nearest point.
2. "I want to place a keyframe on the timeline, change something, and it is recorded, like After Effects."
3. The timeline has three views (Actions, Layers, Keys). Each view shows a part of the truth. Keys show the selected step only.

## 2. How other tools do it

| Tool | Model | Good for us | Not for us |
|---|---|---|---|
| After Effects | Layers. Each layer has properties. Each property has a stopwatch; keys are diamonds on a global time ruler. Motion path on the canvas, with key handles. Graph editor. | Global time. Property rows under the layer row. Keys on the canvas path. Hold and ease keys. | Many properties (dimensions, expressions). Steep learning curve. |
| Rive | Design mode and Animate mode. In Animate mode a change makes a key. Only keyed properties show on the timeline. Interpolation panel next to the timeline for the selected keys. | Two clear modes. Show only keyed properties. One small panel for the easing of the selected keys. | State machines (later, maybe). |
| Jitter | No keyframes: **operations** (blocks) on layer rows: move, scale, fade, each with an end value. Layers have a resting design state. In and Out animations. Copy animations to other layers. | Our actions are operations already. Blocks on the element row are easy to see and drag. Copy and paste of blocks. | It has no fine control (one block = one move). |
| Keynote / PowerPoint | Build order list, "after previous", Magic Move between slides. | Our steps and the Actions list. Magic Move = our morph from step to step. | No real timeline. |

## 3. What a user needs (user point of view)

A YouTube creator thinks in **beats** ("now the message goes to the server"), and sometimes in **exact times** ("the bubble must arrive when I say 'server'"). So:

1. **One timeline, global time.** All steps on one ruler. Steps are sections on the ruler (colored bands with the title), not separate rows. The user does not need to know which step owns an action to move it in time.
2. **One row for each element** (layer). The row shows the life bar (in to out), the action blocks on it (enter, send, pulse, exit, count), and the keyframes. Drag a block to move it, drag its ends to change the duration. A block dragged over a step border moves to that step.
3. **Twirl down** an element row to see its keyed properties (Position, Size, Opacity, Fill, …), with diamonds. Only properties that have keys show (Rive).
4. **Record:** move the playhead, change the element (canvas or properties), and a key is recorded at that time. This is our auto-key (K). The ◆ buttons in the properties stay.
5. **On the canvas:** the motion path of the selected element, with a dot for each position key. Drag a dot to change the key. A send shows its path as a dashed line on the arrow.
6. **Easing:** for the selected keys or blocks: presets (linear, ease, ease-in, ease-out, bounce), **hold** (jump at the key), and a small curve preview.
7. **Many at once:** select many keys or blocks (box select, Shift), drag them together, copy and paste them to another element (Jitter).

What we do not change: steps stay. They are the beats of the story, the place of captions, and the unit for agents and presenters. The new timeline is a better view and editor of the same data.

## 4. Data model mapping (no schema change)

- Global time t → the step that contains t, and the time in that step. This is `resolveTimeline` now.
- A key at global time t = a one-element morph that ends at t, in the step that contains t (docs/16).
- A block = an action. Its row = its target (one row for each target, if the action has many targets).
- Drag a block over a step border: `action.remove` in the old step + `action.add` in the new step, with the delay from the new step start. One history entry.

## 5. Plan

| # | Item |
|---|---|
| T1 | **Tracks view**: one row for each element, with life bar, action blocks, and keys, on global time. Steps as sections on the ruler. Replaces the Actions, Layers, and Keys tabs (Actions stay in the properties panel). |
| T2 | Twirl-down property rows with keys, in global time (keys of all steps). Record (auto-key) works in all steps from the playhead. |
| T3 | Motion path on the canvas, with draggable key dots. |
| T4 | Easing panel for the selected keys and blocks: presets, hold, curve preview. |
| T5 | Multi-select, drag together, copy and paste of keys and blocks. |
| T6 | Drag a block across a step border to move it to that step. |

Each item: a usable workflow first, then tests, then the next item.
