/**
 * Self-contained HTML player file (FR-EXPORT-08): one file plays the scene with no network.
 * Pure: the caller gives the player script and the font files.
 */
import { sceneToJson } from "@anivo/fileio";
import { type IconPack, getIconPack } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import type { PlayerBundle } from "./player.js";
import { sceneNeeds } from "./needs.js";

const toBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Only the icons that the scene uses, from the registered packs. */
export function usedIcons(scene: Scene): IconPack[] {
  const byPack = new Map<string, Set<string>>();
  for (const el of Object.values(scene.elements)) if (el.type === "icon") (byPack.get(el.pack) ?? byPack.set(el.pack, new Set()).get(el.pack)!).add(el.name);
  const out: IconPack[] = [];
  for (const [name, icons] of byPack) {
    const pack = getIconPack(name);
    if (!pack) continue;
    out.push({ ...pack, icons: Object.fromEntries([...icons].flatMap((i) => (pack.icons[i] ? [[i, { ...pack.icons[i]!, tags: [] }]] : []))) });
  }
  return out;
}

export interface HtmlOptions {
  /** The player bundle (assets/player/anivo-player.js). */
  playerJs: string;
  /** Font files: family, weight, and WOFF2 bytes. Only the families the scene uses go into the file. */
  fonts: { family: string; weight: string; bytes: Uint8Array }[];
  /** Asset bytes by asset ID (images, audio). */
  assets?: Map<string, Uint8Array>;
  captions?: "bottom" | "top";
  autoplay?: boolean;
  loop?: boolean;
}

/** Make the HTML file. Register the icon packs before the call. */
export function playerHtml(scene: Scene, opts: HtmlOptions): string {
  const needs = sceneNeeds(scene);
  const assets: Record<string, string> = {};
  for (const id of Object.keys(scene.assets)) {
    const b = opts.assets?.get(id);
    if (b) assets[id] = toBase64(b);
  }
  const bundle: PlayerBundle = {
    scene: JSON.parse(sceneToJson(scene)),
    assets,
    icons: usedIcons(scene),
    fonts: opts.fonts.filter((f) => needs.fonts.includes(f.family)).map((f) => ({ family: f.family, weight: f.weight, data: toBase64(f.bytes) })),
    ...(opts.captions ? { captions: opts.captions } : {}),
  };
  // JSON inside <script>: "<" must not close the element.
  const data = JSON.stringify(bundle).replace(/</g, "\\u003c");
  const js = opts.playerJs.replace(/<\/script/gi, "<\\/script");
  const title = escapeHtml(scene.meta.title || "Anivo video");
  const v = scene.settings.video;
  const attrs = ["controls", opts.autoplay ? "autoplay" : "", opts.loop ? "loop" : ""].filter(Boolean).join(" ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Anivo">
<title>${title}</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #0b0f14; }
  main { max-width: min(100vw, calc(100vh * ${v.width} / ${v.height})); margin: 0 auto; padding: 16px; box-sizing: border-box; }
</style>
</head>
<body>
<main>
<anivo-player ${attrs}>
<script type="application/json">${data}</script>
</anivo-player>
</main>
<script type="module">${js}</script>
</body>
</html>
`;
}
