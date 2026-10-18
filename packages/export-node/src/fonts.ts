import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type IconPack, registerIconPack } from "@anivo/render";
import { GlobalFonts } from "@napi-rs/canvas";
import { homePath } from "./home.js";

/** The bundled font folder (docs/07 "Fonts"). */
/** The bundled font folder. */
export const bundledFontsDir = () => homePath("assets", "fonts");

const FAMILY: Record<string, string> = {
  inter: "Inter",
  kalam: "Kalam",
  "jetbrains-mono": "JetBrains Mono",
};

let registered = false;

/**
 * Register the bundled fonts with Skia. Call before the first render.
 * The renderer must not use system fonts, because system fonts change text layout.
 */
export function registerBundledFonts(dir = bundledFontsDir()): void {
  if (registered && dir === bundledFontsDir()) return;
  for (const file of readdirSync(dir)) {
    const match = /^(.+)-latin-\d+-normal\.woff2$/.exec(file);
    if (!match) continue;
    const family = FAMILY[match[1]!];
    if (family) GlobalFonts.registerFromPath(join(dir, file), family);
  }
  if (dir === bundledFontsDir()) registered = true;
}

/** The bundled icon pack folder. */
export const bundledIconsDir = () => homePath("assets", "icons");

let iconsRegistered = false;

/** Register the bundled icon packs (Lucide, Fluent) with the renderer. */
export function registerBundledIconPacks(dir = bundledIconsDir()): void {
  if (iconsRegistered && dir === bundledIconsDir()) return;
  // Lucide is the default pack, so it comes first in search results.
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => (a === "lucide.json" ? -1 : b === "lucide.json" ? 1 : a.localeCompare(b)));
  for (const file of files) {
    registerIconPack(JSON.parse(readFileSync(join(dir, file), "utf8")) as IconPack);
  }
  if (dir === bundledIconsDir()) iconsRegistered = true;
}

/** Register the bundled fonts and icon packs. */
export function registerBundledAssets(): void {
  registerBundledFonts();
  registerBundledIconPacks();
}
