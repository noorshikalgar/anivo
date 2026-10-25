# 34 — Feature 3: effects you can see and control

Status: built, 2026-10-25. Owner: "if I want to add some effects on text, typing effect or fade in, I should be able to move, edit, delete with ease."

## 1. What was hard

| # | Problem |
|---|---|
| P1 | An effect was only a block in a timeline row. From the element, you could not see which effects it has, or when. |
| P2 | A block could move and stretch at its end only. No Delete key, no menu: to delete or change the effect, you opened the Actions tab and found the action. |
| P3 | To add an effect you needed a step and the Actions tab. |

## 2. Built

| # | Item |
|---|---|
| E1 | **Block menu** (right click on a block): Edit…, the effect (Fade, Rise, Pop, Type, Letters cascade, Blur) for an enter or exit, Duplicate (a copy right after it), Delete. **Delete or Backspace** on a block deletes it. |
| E2 | **Start edge**: drag the left edge of a block to change its start; the end stays. (The right edge changes the end; the middle moves it.) |
| E3 | **Animation list** in the element properties: every effect on the element, in time order, with its time (for example 0:00.0–0:00.5). Click a row to go to it (the timeline opens, the playhead goes to its start); × deletes it. Buttons add Fade in, Rise, Pop, Type and Words rise (for text), Pulse, or Fade out at the playhead. With Feature 2, no step is needed first. |
| E4 | The viewport header shows "Step 1", not "Step 1 · Step 1", when a step has its default title. |
