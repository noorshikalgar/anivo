# 30 — Round 11: animate a diagram in one click

Status: build, 2026-10-24. A user who draws or imports a diagram had to add an enter for the shapes, then a draw-on for the arrows, then fix the order. That is the most common first animation.

| # | Item |
|---|---|
| B1 | Done. **Build** (quick action, `anivo build --step --ids`): the selected shapes rise in reading order (top to bottom, then left to right), then the arrows between them draw. The arrows are chained to the shapes (`after`), so a change of timing keeps the order. Groups (widgets) rise as one. |
