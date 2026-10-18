import { BUNDLED_FONTS } from "@anivo/export-web/fonts";
import { playerHtml, sceneNeeds } from "@anivo/player/html";
import type { Scene } from "@anivo/schema";

const base = new URL(import.meta.env.BASE_URL, location.href);

async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`A file for the HTML player did not load: ${url} (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The bundled font files that the scene uses, for files that embed fonts (HTML, SVG). */
export async function loadFontBytes(scene: Scene): Promise<{ family: string; weight: string; bytes: Uint8Array }[]> {
  const needs = sceneNeeds(scene);
  return Promise.all(BUNDLED_FONTS.filter((f) => needs.fonts.includes(f.family)).map(async (f) => ({ family: f.family, weight: f.weight, bytes: await bytes(new URL(`fonts/${f.file}`, base).href) })));
}

/** One HTML file that plays the scene with no network (FR-EXPORT-08). */
export async function exportHtml(scene: Scene, assets: Map<string, Uint8Array>, captions?: "bottom" | "top"): Promise<string> {
  const res = await fetch(new URL("player/anivo-player.js", base).href);
  if (!res.ok) throw new Error("The player script is missing on this server. Build it with 'pnpm build:player'.");
  const playerJs = await res.text();
  const fonts = await loadFontBytes(scene);
  return playerHtml(scene, { playerJs, fonts, assets, ...(captions ? { captions } : {}) });
}
