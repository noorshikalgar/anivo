# 38 — Feature 7: lists and headers with room

Status: design and build, 2026-10-26. Follows docs/35 (the Inspector) for the other areas.

## 1. What is hard now

| # | Problem |
|---|---|
| P1 | The left area has a tab "Steps", then a header that says "Steps" again. The same for "Library". |
| P2 | Step rows are 22 px high. In the frame view, the line "0:01.9 · 3 actions" cuts, because the hidden More button keeps its width. |
| P3 | Outliner rows are 22 px, fields are 22 px: small targets for the pointer. |
| P4 | Area headers are 26 px, with a 20 px search field. |

## 2. The change

| Item | Before | After |
|---|---|---|
| Area header | 26 px, title always | 34 px; no title when a tab above names the area |
| Search field | 20 px, max 140 px | 24 px, max 180 px |
| Step row | 22 px (44 px with frames) | 30 px (52 px with frames) |
| Step More button | takes width when hidden | floats over the row end |
| Outliner row | 22 px | 26 px |
| Fields and menus | 22 px | 24 px |

## 3. Built

| # | Item |
|---|---|
| L1 | Done. No duplicate titles under the Steps and Library tabs. |
| L2 | Done. Roomier step rows; the More button does not take width. |
| L3 | Done. Outliner rows 26 px; fields 24 px; area headers 34 px. |
