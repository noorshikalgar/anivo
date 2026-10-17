import { type IconPack, registerIconPack } from "@anivo/render";

/** Font files in `assets/fonts`, with their family and weight. */
export const BUNDLED_FONTS = [
  { family: "Inter", weight: "400", file: "inter-latin-400-normal.woff2" },
  { family: "Inter", weight: "500", file: "inter-latin-500-normal.woff2" },
  { family: "Inter", weight: "700", file: "inter-latin-700-normal.woff2" },
  { family: "Kalam", weight: "400", file: "kalam-latin-400-normal.woff2" },
  { family: "Kalam", weight: "700", file: "kalam-latin-700-normal.woff2" },
  { family: "JetBrains Mono", weight: "400", file: "jetbrains-mono-latin-400-normal.woff2" },
  { family: "JetBrains Mono", weight: "500", file: "jetbrains-mono-latin-500-normal.woff2" },
] as const;

/**
 * Load the bundled fonts from `baseUrl` (the folder that serves `assets/fonts`).
 * Call before the first render. Do not use fonts from a CDN (docs/07 "Fonts").
 */
export async function loadBundledFonts(baseUrl: string): Promise<void> {
  // The TypeScript DOM library omits FontFaceSet.add(), so use a local type.
  type FontSet = { add(face: FontFace): void };
  const g = globalThis as unknown as { document?: { fonts: FontSet }; fonts?: FontSet };
  const fonts = g.document?.fonts ?? g.fonts;
  if (!fonts) throw new Error("This environment has no font set. Load fonts in a window or a worker.");
  await Promise.all(
    BUNDLED_FONTS.map(async ({ family, weight, file }) => {
      const face = new FontFace(family, `url(${new URL(file, baseUrl).href})`, { weight });
      fonts.add(await face.load());
    }),
  );
}

/** Load icon packs from `baseUrl` (the folder that serves `assets/icons`) and register them. */
export async function loadIconPacks(baseUrl: string, names: string[] = ["lucide", "fluent"]): Promise<void> {
  await Promise.all(
    names.map(async (name) => {
      const res = await fetch(new URL(`${name}.json`, baseUrl).href);
      if (!res.ok) throw new Error(`The icon pack '${name}' did not load (HTTP ${res.status}).`);
      registerIconPack((await res.json()) as IconPack);
    }),
  );
}
