import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { playerHtml } from "@anivo/player/html";
import type { Scene } from "@anivo/schema";
import { bundledFontsDir, registerBundledAssets } from "./fonts.js";
import { homePath } from "./home.js";

const FAMILY: Record<string, string> = { inter: "Inter", kalam: "Kalam", "jetbrains-mono": "JetBrains Mono" };

/** Write one HTML file that plays the scene with no network (FR-EXPORT-08). Returns the size in bytes. */
export function exportHtml(scene: Scene, out: string, opts: { assets?: Map<string, Uint8Array>; captions?: "bottom" | "top"; autoplay?: boolean; loop?: boolean } = {}): number {
  registerBundledAssets();
  const playerFile = homePath("assets", "player", "anivo-player.js");
  if (!existsSync(playerFile)) throw new Error("The player script is missing. Build it with 'pnpm build:player'.");
  const fonts = readdirSync(bundledFontsDir()).flatMap((file) => {
    const m = /^(.+)-latin-(\d+)-normal\.woff2$/.exec(file);
    const family = m ? FAMILY[m[1]!] : undefined;
    return m && family ? [{ family, weight: m[2]!, bytes: new Uint8Array(readFileSync(join(bundledFontsDir(), file))) }] : [];
  });
  const html = playerHtml(scene, { playerJs: readFileSync(playerFile, "utf8"), fonts, ...opts });
  writeFileSync(out, html);
  return Buffer.byteLength(html);
}
