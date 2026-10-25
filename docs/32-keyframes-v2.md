# 32 — Feature 1: keyframes that work like After Effects

Status: built, 2026-10-25. Owner feedback (screenshot): "I added a keyframe after Record, and when I play, the timeline is very fast. I cannot drag a keyframe to the very start. I set the text color to transparent, but at the start the text is still visible. The animation shows text, invisible text, then text."

## 1. Why it happened

The old keys were morph actions inside a step.

| Problem | Cause |
|---|---|
| Very fast | A step is as long as its keys. A key at 0.1 s made the step 0.1 s long, and there was no room on the ruler. |
| No key at the very start | The value at the start of a step is the base value; a key had to be 50 ms or more after the step start. |
| Panel and canvas disagree | The panel showed the value of the selected key; the canvas showed the value at the playhead. |
| Visible, invisible, visible | The first key changed the value from the step start; the base value stayed before it. |
| No key in a new scene | Keys needed a step, and the playhead could not go past the end of an empty video. |

## 2. The new model

| Rule | Detail |
|---|---|
| Keys are on the element, at video times | `element.keys.opacity = [{ t: 0, v: 0 }, { t: 1500, v: 1 }]`. Not in a step. |
| A key can be at 0 | Before the first key the property has the first key value; after the last key, the last value; between keys it moves with the ease of the earlier key. |
| The video lasts until the last key | The ruler always has room: at least 10 s, or the video plus 3 s. The playhead can go there. |
| The panel shows the value at the playhead | The same value as the canvas, at every time. |
| Keys win | A property with keys takes its value from the keys, over what steps set. |
| The first key of a property after 0 | It also gets a key with the value before the change, at the start of the step that holds the playhead (or at 0). So a change animates from how it was, and does not drift over the whole video. A theme default color uses the theme token as that value. |
| Older scenes | Their step keys (morphs) still show and still work; new keys are element keys. |

## 3. What a user does

| Task | How |
|---|---|
| Invisible at the start, then it comes in | Record (K) on. Playhead at 0: Opacity 0. Playhead at 1 s: Opacity 100. Play. |
| Move a key, also to 0 | Drag the ◆. Arrow keys: 100 ms (Shift: 500 ms). |
| Delete a key | Select the ◆ and press Delete, or click the ◆ next to the property at the playhead. |
| Ease | Select the ◆, then F9, or the curve in the timeline bar. |
| Many keys | Shift + click, or box select; Alt + drag stretches; Ctrl + C / Ctrl + V copies to another element. |
| Keys in a new scene | Works with no step: keys do not need steps. |
| Agents | `key <id> at=1.5s opacity=0 x=400 [ease=linear]` in Anivo Script; `anivo print` writes them back. |

## 4. Next (Feature 2 and on)

- Steps: make them simple or optional (the owner: "we can change this step thing completely").
- Text effects (typing, fade in) as blocks that are as easy to move, edit, and delete as keys.
- Spacing, padding, and density of the panels.
