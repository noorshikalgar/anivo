/** The user's own icon packs in the browser (FR-EXT-01), kept in IndexedDB. */
import { type IconPack, iconName, iconPackFromSvgs, registerIconPack } from "@anivo/render";
import { idbGet, idbSet } from "./idb.js";

const KEY = "iconPacks";

/** Register the saved packs. Call at start. */
export async function loadUserIconPacks(): Promise<void> {
  const packs = (await idbGet<IconPack[]>(KEY).catch(() => undefined)) ?? [];
  packs.forEach(registerIconPack);
}

/** Ask for a folder of SVG files, make a pack, save it, and register it. Returns the pack name, or null if cancelled. */
export async function addIconPackFromFolder(): Promise<{ pack: string; icons: number; skipped: string[] } | null> {
  const files = await new Promise<File[] | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".svg,image/svg+xml";
    input.setAttribute("webkitdirectory", "");
    input.onchange = () => resolve(input.files ? [...input.files] : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!files) return null;
  const svgs = files.filter((f) => f.name.toLowerCase().endsWith(".svg"));
  if (svgs.length === 0) throw new Error("The folder has no .svg files.");
  const folder = (svgs[0]!.webkitRelativePath || "custom/").split("/")[0] || "custom";
  let name = iconName(folder) || "custom";
  if (name === "lucide" || name === "fluent") name = `${name}-custom`;
  const { pack, skipped } = iconPackFromSvgs(name, await Promise.all(svgs.map(async (f) => ({ name: f.name, svg: await f.text() }))));
  const icons = Object.keys(pack.icons).length;
  if (icons === 0) throw new Error("No SVG file converted. Use SVG files with path, line, polyline, polygon, circle, ellipse, or rect elements.");
  const saved = ((await idbGet<IconPack[]>(KEY).catch(() => undefined)) ?? []).filter((p) => p.pack !== pack.pack);
  await idbSet(KEY, [...saved, pack]);
  registerIconPack(pack);
  return { pack: pack.pack, icons, skipped };
}
