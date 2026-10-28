# 41 — Caption styles

Status: built, 2026-10-28. Owner: "for that caption it still looks boxy. We need to adapt the style of caption to the video style … some may have a background, some only floating text, some captions can be on the content like a slam text."

## 1. Styles

| Style | Look | Place | Good for |
|---|---|---|---|
| `card` (default) | A card with an accent bar; the text types in. | A free place, bottom center first (docs/40). | Tutorials, product demos. |
| `subtitle` | Floating text with a soft halo of the background color. No box. | Bottom center first. | Documentary, calm explainers, any picture. |
| `bar` | A band over the full width, in inverse colors, with an accent line on top. | Always near the bottom. Keep the band free. | News, reports, strong contrast. |
| `marker` | A highlighter stroke under each line; it grows as the text types. Uses the hand-drawn font in the sketch style. | A free place. | Classroom, notes, sketch videos. |
| `slam` | Big bold words over the content. The picture dims, and the words pop in. | The center. | A short punch line (3 to 8 words): a hook, a key result. Not for long sentences. |
| `none` | No caption. The step timing does not change. | — | Voice only. |

## 2. Where to set it

| Level | Script | Editor |
|---|---|---|
| Scene | `scene "…" caption-style=subtitle` | Scene → Video → Caption style |
| One step | `step "…" caption="…" caption-style=slam` | (script and agents) |

A step value wins over the scene value.

## 3. Built

| # | Item |
|---|---|
| S1 | Done. `CaptionStyle` in the schema: `settings.captionStyle`, `step.caption.style`. |
| S2 | Done. The renderer draws the six styles (render.ts `drawStepCaption`). The SVG export draws text outlines (`strokeText`). |
| S3 | Done. Script `caption-style=` on the scene and on a step; print writes it back. |
| S4 | Done. Editor: Caption style in the Scene panel. |
