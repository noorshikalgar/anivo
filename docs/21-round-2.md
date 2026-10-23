# 21 — Round 2: more beautiful animation, more control, more reuse

Status: plan, 2026-10-24. After docs/20 (B1–B10 built). Same method: each item is a usable workflow with a sample, then tests.

## 1. Beautiful animation

| # | Item |
|---|---|
| C1 | Done. **Text effects**: letters cascade (each letter rises with a stagger), scramble (random letters settle into the text, seeded), marker sweep (a highlight that draws across words), strike-through that draws. |
| C2 | Done. **Line effects**: marching ants (a dashed arrow whose dashes move), a pulse that travels along an arrow, an arrowhead that leads while the line draws. |
| C3 | Done. **Backgrounds**: gradient and vignette backgrounds, a soft grain, a slowly moving grid. |
| C4 | Done. **Step transitions**: slide, push, zoom through, and blur (with the existing fade, dip, flash, wipe). |
| C5 | Done. **Camera**: ease presets for camera moves, a slow drift (Ken Burns) for a step, and follow an element. |

## 2. More control

| # | Item |
|---|---|
| C6 | Done. **Stagger order** (script `order=`, also from the edges) for one action with many targets: in order, reverse, from the center, random (seeded). |
| C7 | **Chain actions** in the timeline: snap a block to the end of the block before it ("after previous") with one drag, and keep the chain when the first block moves. |
| C8 | **Exit for every enter**: the same effect, reversed, in one click; and "remove at the end of the step". |
| C9 | **Number formats** for count: thousands, currency, percent, duration. |

## 3. More reuse

| # | Item |
|---|---|
| C10 | **Composition slots**: when you insert a composition, you set its texts (for example the word and the meaning of a definition card). |
| C11 | **Preset packs**: export and import your presets as a file, as compositions can. |
| C12 | **Style presets**: save the look of an element (fill, stroke, radius, font, shadow) and apply it to others. |
