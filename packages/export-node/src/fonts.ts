import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
