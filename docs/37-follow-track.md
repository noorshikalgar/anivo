# 37 — Feature 6: the timeline follows the selection

Status: design and build, 2026-10-26.

## 1. What is hard now

| # | Problem |
|---|---|
| P1 | You select an element on the canvas or in the Outliner. Its track can be below the visible part of the timeline. You must scroll to find it. |
| P2 | You click a ◆ in the Inspector. The new key is on a closed track, or the track is out of view. You do not see that the key exists. |

## 2. The change

As in After Effects (the layer shows when you select it, and a keyed property opens):

| Rule | Detail |
|---|---|
| Follow | When the selection changes, the track of the first selected element scrolls into view. The track goes under the ruler, not behind it. The timeline does not scroll when the track is already visible. |
| Open on a new key | When a selected element gets a key on a new property, its track opens, so the key rows show. |

## 3. Built

| # | Item |
|---|---|
| F1 | Done. Follow the selection. |
| F2 | Done. Open the track on a new keyed property. |
