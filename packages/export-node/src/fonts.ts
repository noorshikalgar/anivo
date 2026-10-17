import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type IconPack, registerIconPack } from "@anivo/render";
import { GlobalFonts } from "@napi-rs/canvas";

/** The bundled font folder (docs/07 "Fonts"). */
export const BUNDLED_FONTS_DIR = fileURLToPath(new URL("../../../assets/fonts/", import.meta.url));

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
export function registerBundledFonts(dir = BUNDLED_FONTS_DIR): void {
  if (registered && dir === BUNDLED_FONTS_DIR) return;
  for (const file of readdirSync(dir)) {
    const match = /^(.+)-latin-\d+-normal\.woff2$/.exec(file);
    if (!match) continue;
    const family = FAMILY[match[1]!];
    if (family) GlobalFonts.registerFromPath(join(dir, file), family);
  }
  if (dir === BUNDLED_FONTS_DIR) registered = true;
}

/** The bundled icon pack folder. */
export const BUNDLED_ICONS_DIR = fileURLToPath(new URL("../../../assets/icons/", import.meta.url));

let iconsRegistered = false;

/** Register the bundled icon packs (Lucide, Fluent) with the renderer. */
export function registerBundledIconPacks(dir = BUNDLED_ICONS_DIR): void {
  if (iconsRegistered && dir === BUNDLED_ICONS_DIR) return;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    registerIconPack(JSON.parse(readFileSync(join(dir, file), "utf8")) as IconPack);
  }
  if (dir === BUNDLED_ICONS_DIR) iconsRegistered = true;
}

/** Register the bundled fonts and icon packs. */
export function registerBundledAssets(): void {
  registerBundledFonts();
  registerBundledIconPacks();
}
