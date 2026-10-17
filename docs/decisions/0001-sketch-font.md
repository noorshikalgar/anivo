# 0001 — Hand-drawn font for the sketch style

- Status: accepted
- Date: 2026-10-17
- Open question: Q2 in [14](../14-risks-and-open-questions.md)

## Context

The `sketch` style needs a hand-drawn font. The font must have the OFL license, read well at 1080p, and render the same in the browser and in Node.
The candidates were Excalifont, Virgil, and Kalam.

## Decision

Use **Kalam** (Indian Type Foundry, SIL OFL 1.1) for the `sketch` style.

## Reasons

1. Kalam has the OFL 1.1 license. It is available from `@fontsource/kalam` with pinned versions.
2. Kalam has regular and bold weights. Labels need both.
3. Kalam also supports Devanagari. Hindi and Marathi labels are possible later with the Devanagari subset.
4. In the phase 0 spike, Kalam text rendered the same in Chromium and in Node (sketch frames differ by a maximum of 0.17% of pixels, including text).
5. Excalifont and Virgil look like Excalidraw. Anivo must not look like an Excalidraw copy.

## Consequences

- Bundle `kalam-latin-400` and `kalam-latin-700` in `assets/fonts`.
- The theme key `fonts.sketch` is `Kalam`. A user can override the font for each element.
- Examine the font again after user feedback in phase 1. A change of font changes golden frames.
