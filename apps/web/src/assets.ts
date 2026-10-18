import { loadBundledFonts, loadIconPacks } from "@anivo/export-web";
import { type Scene, loadScene } from "@anivo/schema";
import { loadUserIconPacks } from "./iconPacks.js";

const base = new URL(import.meta.env.BASE_URL, location.href);

/** Load the bundled fonts and icon packs. The renderer needs them before the first frame. */
export function loadAssets(): Promise<unknown> {
  // The user packs register after the bundled packs.
  return Promise.all([loadBundledFonts(new URL("fonts/", base).href), loadIconPacks(new URL("icons/", base).href)]).then(() => loadUserIconPacks());
}

/** Load a built-in template from assets/templates. */
export async function loadTemplate(name: string): Promise<Scene> {
  const res = await fetch(new URL(`templates/${name}.anivo.json`, base).href);
  if (!res.ok) throw new Error(`The template '${name}' did not load (HTTP ${res.status}).`);
  const r = loadScene(await res.json());
  if (!r.ok) throw new Error(`The template '${name}' is not valid: ${r.issues[0]?.message ?? ""}`);
  return r.scene;
}
