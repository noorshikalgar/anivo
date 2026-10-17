# Third-party asset licenses

Record each bundled asset here before you add it. See docs/12-quality-and-security.md "Third-party assets".

## Fonts

| Font | Files | License | Source |
|---|---|---|---|
| Inter | `fonts/inter-latin-{400,500,700}-normal.woff2` | SIL OFL 1.1 ([LICENSE-Inter.txt](fonts/LICENSE-Inter.txt)) | `@fontsource/inter` |
| Kalam | `fonts/kalam-latin-{400,700}-normal.woff2` | SIL OFL 1.1 ([LICENSE-Kalam.txt](fonts/LICENSE-Kalam.txt)) | `@fontsource/kalam` |
| JetBrains Mono | `fonts/jetbrains-mono-latin-{400,500}-normal.woff2` | SIL OFL 1.1 ([LICENSE-JetBrainsMono.txt](fonts/LICENSE-JetBrainsMono.txt)) | `@fontsource/jetbrains-mono` |

> **NOTE:** Kalam is the phase 0 candidate for the sketch style. The final hand-drawn font is decision Q2 in docs/14.

## Icons

Built by `pnpm build:icons` (scripts/build-icon-packs.ts) from the npm packages below.

| Pack | File | Icons | License | Source |
|---|---|---|---|---|
| Lucide | `icons/lucide.json` | 1,891 (stroke) | ISC | `lucide-static` 1.59.0 |
| Fluent System Icons | `icons/fluent.json` | 2,476 (24 px regular, fill) | MIT | `@fluentui/svg-icons` 1.1.344 |
