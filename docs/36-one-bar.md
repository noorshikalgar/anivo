# 36 — Feature 5: one timeline bar

Status: design and build, 2026-10-26. Follows docs/35 (panels with room).

## 1. What is hard now

| # | Problem |
|---|---|
| P1 | The timeline has two bars on top of the tracks: the playback bar (title, play controls, time) and the tools bar (Record, key buttons, time again, a hint, track filter, zoom). Two bars take 52 px from the tracks. |
| P2 | The time shows two times. |
| P3 | The hint "Click a block or a ◆ to edit it" is always on the screen. After the first minute, it is clutter. |

## 2. The change

One bar, as in Premiere Pro and DaVinci Resolve:

| Left | Center | Right |
|---|---|---|
| Timeline · Record · ◀◆ ◆▶ · loop · the selected key (easing, Delete key) | Go to start · Previous step · Play · Next step · Go to end · time | All / Animated / Selected · − Fit + · Show or hide the timeline |

- The playback bar has two slots. The open timeline puts its tools into them (a React portal), so the tools keep their state in the timeline.
- When the timeline is hidden, the bar shows only the play controls.
- The always-on hint is gone. The status bar and the tooltips tell the same thing.

## 3. Built

| # | Item |
|---|---|
| B1 | Done. One bar, 34 px, three columns; the play controls stay in the center. |
| B2 | Done. One time display. |
| B3 | Done. No always-on hint. The Record tooltip uses the words of docs/32 ("for the whole video"). |
| B4 | Done. The selected key tools are short (◆ group name, curve, easing, a Delete icon), and the left side gets all free space, so they fit at 1280 px. |
