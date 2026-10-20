# 16 — Animate: keyframes, auto-key, transitions, and builds

Users want more control over time: change a property at an exact time, as in a motion design tool. This document takes ideas from tools such as After Effects and Blender, and fits them to the Anivo model. It does not copy their UI.

## 1. What the tools do well

| Idea | In motion tools | In Anivo |
|---|---|---|
| Keyframes | A property has values at times. The tool tweens between them. | A **keyframe** is the end of a morph action. The morph tweens from the value before it. |
| Stopwatch and auto-key | One click starts keyframes for a property. In record mode, each change at the playhead makes a keyframe. | **Auto-key** (the record button in the timeline header). A change at the playhead makes a keyframe at that time. |
| Layers with property rows | The timeline shows each layer, and under it its animated properties with diamonds. | The **Keys** view of the timeline: one row for each element, and one row for each animated property, with diamonds. |
| Easing per keyframe | Linear, ease, hold, and a graph. | Each keyframe has an easing (the easing of its morph). |
| Keyframe navigation | Go to the previous or the next keyframe. | ◀ ◆ ▶ in the property row. |
| Presets | Effects for a layer with one click. | Quick actions (docs/15 section 5), and **builds** (section 4). |
| Transitions | A transition between two parts. | A **step transition** (section 3). |

## 2. Keyframes and auto-key

1. The data model does not change. Steps contain actions. A keyframe of property P at time T in step S is a morph action in S, on one element, with `to.P`, that ends at T.
2. The morph starts at the keyframe before it (in the same step), or at the start of the step. So: `delayMs = previous time`, `durationMs = T - previous time`.
3. **Auto-key off** (default): a change in a step makes a morph that ends at the end of the step (as before).
4. **Auto-key on**: a change makes a keyframe at the playhead. If a keyframe of that property is at the playhead, the change updates it.
5. The Keys view shows the keyframes of the selected step. Drag a diamond to change its time. Delete removes it. Click a diamond to move the playhead to it.
   - The Keys view shows the selected step only, with 25% more time after its end. Click the ruler after the step end to put a keyframe there: the step gets longer.
   - The keyframe bar: ◀ and ▶ go to the previous and next keyframe. For the selected keyframe: the easing of the tween to it, and Delete.
   - Arrow keys move the focused diamond 100 ms (Shift: 500 ms).
   - Press **K** to turn auto-key on or off. The record button in the timeline header shows the state.
   - When you move or delete a keyframe, the tween of the next keyframe of that property starts at the new time.
6. Agents use the same morph actions (`morph a x=600 +400ms dur=600ms`).

## 3. Step transitions

A step can have a transition at its start: `fade` (through the background color), `dip` (through black), `flash` (through white), or `wipe` (a band of the background color moves across). The renderer draws it over the frame, around the step start. Settings: kind and duration. The transition does not change the elements.

## 4. Builds

A **build** makes many steps for a common pattern in one action. First build: **bullet list**: a title, then for each point: the point types in the center, then it moves up under the title. Settings: the title, the points (one for each line), and the font sizes. The build makes plain elements, steps, and actions; the user can change all of them after.

## 5. Real time

With a step selected, the canvas shows the end of the step, and it follows the end when the step gets longer. With auto-key on, the canvas shows the playhead time, so a keyframe shows where you make it.
