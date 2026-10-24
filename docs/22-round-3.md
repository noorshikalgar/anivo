# 22 — Round 3: an immersive timeline, more motion, one library

Status: plan, 2026-10-24. After docs/21 (C1–C12 built). Method: an audit sample (`anivo-demo/audit/d1`: bars that fill in from the center, a chained count in the short style, a time count) and the editor at 1440×900 with the TCP template. The audit found and fixed: chains that did not follow the stagger order, `after=` that only some verbs knew, counts that showed as "wait" in the summary, and count text that shook while it counted.

## 1. Findings

| # | Finding |
|---|---|
| F1 | On the timeline you cannot see a frame without moving the playhead. To find a moment, you drag and look at the canvas, then go back. |
| F2 | A chain is a thin mark on the bar. You cannot see which bar it follows, and while you drag the first bar the chained bars do not move with it until you drop it. |
| F3 | Playback keys work only when the timeline has focus. There is no J/K/L shuttle (back, pause, forward) as in video editors. |
| F4 | The Steps list shows only titles. With 20 steps you cannot find a step by its look. |
| F5 | Text comes in by letter or as one block. There is no "words rise in one by one", the most common title animation on explainer channels. |
| F6 | An element that holds on screen is still. There is no slow idle motion (float, breathe) for a hero icon. |
| F7 | Reuse is in three places: Presets (Actions tab), Compositions (a dialog), Widgets (Insert menu). A user does not find them together. |

## 2. Build list

| # | Item | Fixes |
|---|---|---|
| D1 | Done. **Scrub preview**: point at the ruler and a small frame of that time shows above the pointer. | F1 |
| D2 | Done. **Chains you can see**: a thin line from the end of a bar to the chained bar; while you drag a bar, its chained bars move with it. | F2 |
| D3 | Done. **Shuttle keys** anywhere in the editor: J back, L forward (press again for 2×, 4×, 8×; K stays Record, Space stops); `,` and `.` one frame. | F3 |
| D4 | Done. **Step thumbnails** in the Steps list: a small frame of the end of each step. | F4 |
| D5 | Done. **Words rise**: an enter effect where each word rises and fades in after the one before. | F5 |
| D6 | Done. **Idle motion**: float and breathe emphasis effects that loop for their duration, soft enough for a hold. | F6 |
| D7 | Done. **Library panel**: presets, compositions, and widgets in one place, with search and live previews; drag a composition or a widget onto the canvas. | F7 |
