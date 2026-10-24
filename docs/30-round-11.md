# 30 — Round 11: animate a diagram in one click

Status: build, 2026-10-24. A user who draws or imports a diagram had to add an enter for the shapes, then a draw-on for the arrows, then fix the order. That is the most common first animation.

| # | Item |
|---|---|
| B1 | Done. **Build** (quick action, `anivo build --step --ids`): the selected shapes rise in reading order (top to bottom, then left to right), then the arrows between them draw. The arrows are chained to the shapes (`after`), so a change of timing keeps the order. Groups (widgets) rise as one. |
| B2 | Done. A Mermaid import uses the Studio theme, as a new scene does (an Excalidraw import keeps its own colors). |
| B3 | Done. The canvas does not ghost elements that left the video in an earlier step (a title that left no longer sits over the diagram while you edit later steps). |
| B4 | Done. `build <targets>` in Anivo Script, for agents. |
