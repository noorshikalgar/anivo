# 8. Animate

Anivo has two ways to animate. Use them together.

- **Steps and actions**: one idea for each step ("the message goes to the server"). Actions are blocks: appear, type, send, pulse, disappear.
- **Keys**: exact motion at exact times, as in a video editor.

## Design and Animate

Click **Design** or **Animate** in the top bar.

- **Design**: you lay out the diagram. The base state shows. A change sets the element in all steps.
- **Animate**: the timeline opens and a step is selected.

## A step that explains itself

1. Click **Add step** (N).
2. In the **Actions** tab, type a **Caption**: one sentence. It types in next to the element that changes, and the step waits until a viewer can read it.
3. Select elements and click a quick action: **Appear**, **Type**, **One by one**, **Send**, **Pulse**, **Disappear**.
4. **Send**: select a bubble or a packet and an arrow. The bubble glides onto the arrow and stops next to the element at the end.
5. **Insert › Message**: choose who sends and who gets the message. Anivo finds the arrows (for example through a server) and makes two steps: the text types, then the bubble goes.

## The timeline

Click the timeline button (bottom right of the playback bar).

- The ruler shows the whole video. Steps are sections on the ruler: click one to select it.
- Each element has a track: a grey bar while it is on the screen, colored blocks for its actions, and ◆ for its keys.
- Drag a block to move it. Drag its right end to change its duration. Drag it into another step to move it to that step.
- Click ▶ next to an element to see a row for each property that has keys.
- **Filter**: All, Animated, or Selected tracks.
- **Zoom**: −, Fit, + or Ctrl + wheel.
- Keys and blocks snap to the playhead, step borders, and other keys. Hold **Shift** to drag freely.
- **Scrub preview**: point at the ruler. A small frame of that time shows. The playhead does not move.
- **Chains**: drop a block at the end of another block in the same step. It starts when that block ends, and it moves with it. A light bar marks a chained block. **Unchain** (Actions › When) keeps its place in time.

## Keys

A change is static until you animate it. This is the rule:

- **Record off**: a change sets the element in all steps. Nothing moves in the video.
- **Record on** (press **K**, or the red **Record** button): a change makes a key at the playhead. The canvas has a red frame.
- A property that has a key already records its next change as a key.

Ways to make keys:

1. Press **K**, move the playhead, move or change the element. Move the playhead again, change it again.
2. Click **◆** next to a property (Position, Size, Opacity, Fill, …).
3. Select elements and press **I** (position) or **Shift+I** (all properties). **Alt+I** deletes the keys at the playhead.

Edit keys:

- Drag a ◆ in the timeline. Arrow keys move the focused ◆ 100 ms (Shift: 500 ms). **Delete** removes it.
- **Shift + click** selects many keys. Drag on an empty part of the tracks to box select. **Alt + drag** a selected key to stretch or shrink their times.
- **Ctrl+C** and **Ctrl+V** copy keys to another element, from the playhead.
- On the canvas: the dashed path shows the position keys of the selected element. Drag a dot to change that key. The onion skin shows the element at the key before (red) and after (green).

## Easing

- Click the curve in the timeline bar: drag the two handles, or choose a preset (linear, easy ease, slow start, slow end, overshoot, snap, hold).
- **F9**: easy ease. **Shift+F9**: slow end. **Ctrl+Shift+F9**: slow start. **Hold**: the value jumps at the key.

## More tools

- **Follow** (Properties › Transform): an element moves with another element, for example an "HTTPS" label on a packet.
- **Origin** (Properties › Transform): scale and turn around a corner or an edge, for example a pop that grows from the bottom.
- **Type by word** (action editor of a Type action): words appear one at a time.
- **Loop region**: Alt + drag on the ruler. Play goes round in it. Export can make a video of that part only.
- **Motion blur** (Scene › Video): fast moves get a soft trail in the video.
- **Draw a motion path**: select an element and a step, press **P**, and drag on the canvas. The element moves along the line. Drag the square dots to change the path.
- **Stagger order** (action editor, more than one target): in order, reverse, from the center, from the edges, or shuffle.
- **Matching exit** (action editor of an enter): the same effect as an exit, after the step or when the next step starts.
- **Spotlight** and **Circle** (quick actions): the frame goes dark around an element, or a hand-drawn circle draws around it.
- **Float** and **Breathe** (presets): slow idle motion while an element holds.

## Reuse

- **Library** (the tab next to Steps): widgets, your widgets, compositions, motion presets, and styles, with one search. Drag a widget or a composition onto the canvas.
- **Motion presets** (Actions tab): click to apply; save the actions of the selection as your own preset. Export and import your presets as a file.
- **Compositions** (Insert menu): elements with their animations. **Set texts…** before you insert one.
- **Styles** (Properties): ready-made looks, or save your own. **Ctrl+Alt+C** / **Ctrl+Alt+V** copy and paste a style.

## Time keys

With the timeline in focus (click the ruler): **←/→** one frame, **Shift+←/→** ten frames, **Home**/**End**, **↑/↓** the previous or next key.

Anywhere in the editor: **L** plays forward and **J** plays backward. Press again for 2×, 4×, 8× (no sound). **Space** stops. **,** and **.** move one frame (Shift: ten frames).
