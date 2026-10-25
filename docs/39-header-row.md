# 39 — Feature 8: one header row

Status: design and build, 2026-10-26. Follows docs/35 and docs/38.

## 1. What is hard now

| # | Problem |
|---|---|
| P1 | The tops of the areas had different heights: the left tabs 27 px, the view header 26 px, the Outliner header 34 px. Their lines did not meet, so the window looked uneven. |
| P2 | The top bar buttons and the view header buttons were 22 px: smaller than the controls in the panels. |

## 2. The change

| Item | Before | After |
|---|---|---|
| Left tabs (Steps, Library) | 27 px | 34 px + line |
| View header | 26 px | 34 px + line; buttons 26 px |
| Outliner header, Inspector tabs | 34 px + line | no change |
| Top bar | 30 px; buttons 22 px | 38 px; buttons 28 px |

The header lines of the left area, the view, and the Outliner are on one line (measured: the bottom of each is at the same pixel at 1440×900).

## 3. Built

| # | Item |
|---|---|
| H1 | Done. One header row across the window. |
| H2 | Done. Larger top bar and view header buttons. |
