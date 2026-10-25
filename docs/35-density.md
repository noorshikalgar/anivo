# 35 — Feature 4: panels with room

Status: design and build, 2026-10-26. Owner: "it is okay but complex and dense … spacing, padding etc should be matched properly."

## 1. What is hard now

Audit at 1440×900 with the TCP template.

| # | Problem |
|---|---|
| P1 | Rows are 22 px high with 2 px between them. Labels, fields, and buttons touch. |
| P2 | The right column is 300 px. Names in the Animation list and times cut or wrap. |
| P3 | The Inspector tabs are four small icons in a vertical rail, with no words. A new user does not know what they open. |
| P4 | The hint above the panels has two long sentences (four lines in the column). |

## 2. The change

From "Blender dense" to "Figma comfortable". Each value is a token in `ui.tsx`, so all panels change together.

| Item | Before | After |
|---|---|---|
| Control row height | 22 px | 26 px |
| Panel header | 24 px | 30 px |
| Panel body gap / padding | 2 px / 6 8 8 | 6 px / 10 12 12 |
| Property label column | 40 % | 36 %, 10 px gap |
| Panel corners | 4 px | 6 px |
| Inspector tabs | icon rail on the left | text tabs on the top: Scene · Step · Actions · Element |
| Gap between panels | 4 px | 8 px |
| Right column | 300 px | 340 px |
| Hint | two sentences | "To animate, click a ◆ or press K." |

The saved layout key changes to `anivo.areas.v2`, so each user gets the new widths one time. After that, the user's own widths stay.

## 3. Built

| # | Item |
|---|---|
| R1 | Done. Tokens: row, header, body, label column, corners. |
| R2 | Done. Text tabs on the top of the Inspector. |
| R3 | Done. Wider right column (new layout key). |
| R4 | Done. One-line hint. |
| R5 | Done. The Inspector body has no "Element" or "Scene" caption (the tab says it). The element ID shows only in its field. |
| R6 | Done. Animation rows are one line, 28 px high; the time does not wrap. |
