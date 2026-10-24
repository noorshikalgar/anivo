# 25 — Round 6: annotations

Status: plan and build, 2026-10-24. Explainer channels point at things: they darken the frame around one part, or circle it by hand. Anivo had focus (dim the other elements) and highlight (a box behind), but not these two.

| # | Item |
|---|---|
| K1 | Done. **Spotlight** emphasis: the frame goes dark around an element, with a soft edge, then comes back. Script `spotlight <targets>`; preset Spotlight. |
| K2 | Done. **Circle** emphasis: a hand-drawn circle draws around an element, stays, and fades. Script `circle <targets> [color=<token>]`; preset Circle it. |

Both draw above all elements and work in the SVG export (no radial gradient: the spotlight edge is layers).

| # | Item |
|---|---|
| K3 | Done. **Typing looks like typing**: a line that types keeps its letters in their final places (a centered line grew from its center before), and an accent caret follows the last letter. |
