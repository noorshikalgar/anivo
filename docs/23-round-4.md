# 23 — Round 4: test every tool with a real sample

Status: audit and plan, 2026-10-24. Method: three samples that use most tools together, then frames at the middle and the end of each step. Samples: `anivo-demo/audit/e1.txt` (HTTPS: widgets, send along an arrow, code, captions, camera drift), `e2.txt` (cache: icon, diamond, ellipse, table, curved, elbow and two-way arrows, flow with an icon, count, morph, camera zoom), `e3.txt` (emphasis: typewriter by word, mark, focus, glow, wiggle, move along a path, flash, exits with stagger order).

## 1. Findings and fixes

| # | Finding | Status |
|---|---|---|
| E1 | Send a widget (a group) along an arrow: all parts went to the same point, and the group stopped on top of the target. | Fixed: a group moves as one; the stop place uses the box of all parts. |
| E2 | The caption of a step moved while its anchor element moved, and it covered other elements. | Fixed: the caption place comes from the end of the step; the top and bottom bands are also candidates. |
| E3 | With a camera zoom, the caption became larger. | Fixed: the caption keeps its size on the screen. |
| E4 | A caption below an icon covered the icon label. | Fixed: the label is part of the icon box for captions. |
| E5 | An exit left the arrows of the element on the screen, pointing at nothing. | Fixed: an arrow fades with the elements at its ends. Lint warns only when an arrow enters before its element. |
| E6 | A moving element (a packet) goes under the arrow labels on its way. | Fixed: G1. |
| E7 | Two arrows between the same two elements (request and answer) are close together; their labels touch. | Fixed: G2. |

## 2. Build list

| # | Item | Fixes |
|---|---|---|
| G1 | Done. **On top while it moves**: an element that moves along a path or an arrow draws above arrows and their labels for the time of the move. | E6 |
| G2 | Done. **Two-way arrow pairs**: the labels of two arrows between the same elements go to the outer sides of their lines. | E7 |
| U1 | Done. **Start card**: an empty scene shows what to do first: draw a box, open the Library, or write a script. | A new user saw an empty frame. |
| U2 | Done. A new blank scene uses the Studio theme. | The default slate theme looked plain next to the samples. |
