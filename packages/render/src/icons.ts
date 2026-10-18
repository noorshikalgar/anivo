import { type Polyline, polyline } from "@anivo/layout";
import { type Subpath, flattenSvgPath } from "./svgpath.js";

/** An icon pack file from assets/icons (see scripts/build-icon-packs.ts). */
export interface IconPack {
  pack: string;
  version?: string;
  license: string;
  /** `stroke` icons are line drawings (Lucide). `fill` icons are filled outlines (Fluent). */
  kind: "stroke" | "fill";
  viewBox: [number, number, number, number];
  strokeWidth: number;
  /** An icon with its own view box sets `viewBox` (custom packs). */
  icons: Record<string, { d: string[]; tags: string[]; viewBox?: [number, number, number, number] }>;
}

/** A flattened icon in its view box coordinates. */
export interface IconShape {
  kind: "stroke" | "fill";
  viewBox: [number, number, number, number];
  strokeWidth: number;
  subpaths: Subpath[];
  /** Stroke polylines in draw order, for draw-on. */
  strokes: Polyline[];
  totalLength: number;
}

const packs = new Map<string, IconPack>();
const shapes = new Map<string, IconShape | null>();

/** Register an icon pack. The host loads the file (Node: fs; browser: fetch). */
export function registerIconPack(pack: IconPack): void {
  packs.set(pack.pack, pack);
  for (const key of shapes.keys()) if (key.startsWith(`${pack.pack}:`)) shapes.delete(key);
}

/** A registered icon pack, for previews in the UI. */
export function getIconPack(name: string): IconPack | undefined {
  return packs.get(name);
}

export function iconPacks(): string[] {
  return [...packs.keys()];
}

/** Search icons by name and tag. Exact name matches come first. */
export function searchIcons(query: string, opts: { pack?: string; limit?: number } = {}): { pack: string; name: string }[] {
  const q = query.trim().toLowerCase();
  const exact: { pack: string; name: string }[] = [];
  const prefix: { pack: string; name: string }[] = [];
  const other: { pack: string; name: string }[] = [];
  for (const p of packs.values()) {
    if (opts.pack && p.pack !== opts.pack) continue;
    for (const [name, icon] of Object.entries(p.icons)) {
      const hit = { pack: p.pack, name };
      if (name === q) exact.push(hit);
      else if (name.startsWith(q)) prefix.push(hit);
      else if (name.includes(q) || icon.tags.some((t) => t.includes(q))) other.push(hit);
    }
  }
  return [...exact, ...prefix, ...other].slice(0, opts.limit ?? 50);
}

/** Flattened icon shape, or `undefined` if the pack or the icon is not registered. */
export function getIcon(pack: string, name: string): IconShape | undefined {
  const key = `${pack}:${name}`;
  const cached = shapes.get(key);
  if (cached !== undefined) return cached ?? undefined;
  const p = packs.get(pack);
  const icon = p?.icons[name];
  if (!p || !icon) {
    shapes.set(key, null);
    return undefined;
  }
  const subpaths = icon.d.flatMap((d) => flattenSvgPath(d, 8));
  const strokes = subpaths.map((s) => polyline(s.points));
  const shape: IconShape = { kind: p.kind, viewBox: icon.viewBox ?? p.viewBox, strokeWidth: p.strokeWidth, subpaths, strokes, totalLength: strokes.reduce((s, l) => s + l.length, 0) };
  shapes.set(key, shape);
  return shape;
}
