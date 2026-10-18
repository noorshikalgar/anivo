/**
 * Build a bundled CLI in packages/cli/dist (runs with plain Node, no tsx):
 *   dist/anivo.mjs   the bundle
 *   dist/assets/     fonts, icons, templates
 *   dist/prompts/    the scene-agent guide
 * Run: pnpm build:cli. Then: node packages/cli/dist/anivo.mjs --help
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

const out = "packages/cli/dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: ["packages/cli/src/entry.ts"],
  outfile: `${out}/anivo.mjs`,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // Native module: install it next to the bundle (npm dependency of the package).
  external: ["@napi-rs/canvas"],
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __anivoRequire } from "node:module";',
      "const require = __anivoRequire(import.meta.url);",
    ].join("\n"),
  },
  legalComments: "linked",
  logLevel: "warning",
});

cpSync("assets/fonts", `${out}/assets/fonts`, { recursive: true });
cpSync("assets/icons", `${out}/assets/icons`, { recursive: true });
cpSync("assets/templates", `${out}/assets/templates`, { recursive: true });
cpSync("assets/player", `${out}/assets/player`, { recursive: true });
cpSync("assets/LICENSES.md", `${out}/assets/LICENSES.md`);
mkdirSync(`${out}/prompts`, { recursive: true });
cpSync("prompts/scene-agent.md", `${out}/prompts/scene-agent.md`);
console.log(`Built ${out}/anivo.mjs`);
