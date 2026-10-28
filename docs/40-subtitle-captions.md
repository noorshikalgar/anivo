# 40 — Captions as movie subtitles

Status: built, 2026-10-28. Owner feedback on the quantization video: "the text wraps itself in 3 lines but it is in a square shape … it needs to take more horizontal space and fit into 1 or 2 lines, similar to the captions of a movie."

## 1. What was hard

| # | Problem |
|---|---|
| P1 | A caption with an anchor was at most 42 % of the frame wide. A normal caption wrapped to 3 or 4 short lines: a square card. |
| P2 | The caption went next to its anchor element, so its place changed in each step. A viewer had to look for it. |

## 2. The change

| Rule | Detail |
|---|---|
| Width | A caption can be 75 % of the frame wide. |
| Lines | One line when it fits. Else two lines of about the same length. Only a very long caption has more lines. |
| Place | The bottom center of the frame, as a subtitle, when that place covers no element. Else the old rules: next to the anchor, then the bottom band, then the top band. |
| Band | A caption with no anchor tries the bottom band first, then the top band. |

`side=top`, `side=bottom`, and the other fixed sides do not change.

## 3. Built

| # | Item |
|---|---|
| C1 | Done. `captionLines`: one line, or two balanced lines (render.ts). |
| C2 | Done. Bottom center first; bottom band before top band. Unit tests in caption.test.ts. |
