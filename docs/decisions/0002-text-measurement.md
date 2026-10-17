# 0002 — Text measurement with bundled fonts and `measureText`

- Status: accepted
- Date: 2026-10-17
- Changes: [07](../07-rendering-and-export.md) "Rules", item 3

## Context

Document 07 said: "The renderer measures text with its own font metrics from the font files. It does not use DOM measurement."
The reason was the same text layout in the browser and in Node.

## Decision

Use `measureText()` of the canvas context, with the same bundled font files in the browser and in Node.
Do not write a font metrics parser now.

## Reasons

1. The phase 0 cross-engine test measured a maximum difference of 0.17% of pixels, including text. The gate is 0.5%.
2. `measureText()` exists in the browser Canvas 2D API and in `@napi-rs/canvas`. It is not DOM measurement.
3. A font metrics parser (with kerning and shaping) is a large task with no current benefit.

## Consequences

- The cross-engine test in `tests/e2e` guards this decision. If it fails because of text, examine this decision again.
- Fonts must always come from `assets/fonts`. Never use system fonts or a CDN.
