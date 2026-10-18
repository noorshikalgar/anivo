/**
 * Build the <anivo-player> bundle: assets/player/anivo-player.js (one ES module).
 * The web app serves it at /player/anivo-player.js, and the HTML export inlines it.
 * Run: pnpm build:player. The build fails if the bundle is 150 KB gzip or more (FR-PLAY-02).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

// Paths from the repository root, so the script runs from any folder.
const root = fileURLToPath(new URL("..", import.meta.url));
const PLAYER_FILE = `${root}assets/player/anivo-player.js`;
const LIMIT = 150 * 1024;

mkdirSync(`${root}assets/player`, { recursive: true });
await build({
  entryPoints: [`${root}packages/player/src/index.ts`],
  outfile: PLAYER_FILE,
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  banner: { js: "/* Anivo player. MIT License. https://github.com/noorshikalgar/anivo */" },
});
const gz = gzipSync(readFileSync(PLAYER_FILE), { level: 9 }).length;
console.log(`assets/player/anivo-player.js: ${(gz / 1024).toFixed(1)} KB gzip`);
if (gz >= LIMIT) {
  console.error(`The player bundle is ${(gz / 1024).toFixed(1)} KB gzip. The limit is 150 KB (FR-PLAY-02).`);
  process.exit(1);
}
