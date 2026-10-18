/**
 * Icon packs from SVG files (FR-EXT-01). Pure: the host reads the files.
 * Shapes (path, line, polyline, polygon, circle, ellipse, rect) become path data.
 */
import type { IconPack } from "./icons.js";

type Attrs = Record<string, string | number>;
const num = (v: string | number | undefined, d = 0) => (v === undefined ? d : Number(v));

/** Path data of one SVG shape element. Returns null for other elements. */
export function shapeToPath(tag: string, a: Attrs): string | null {
  switch (tag) {
    case "path":
      return a["d"] === undefined ? null : String(a["d"]);
    case "line":
      return `M${num(a["x1"])} ${num(a["y1"])}L${num(a["x2"])} ${num(a["y2"])}`;
    case "polyline":
    case "polygon": {
      const pts = String(a["points"] ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
      let d = "";
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i === 0 ? "M" : "L"}${pts[i]} ${pts[i + 1]}`;
      return d ? (tag === "polygon" ? `${d}Z` : d) : null;
    }
    case "circle": {
      const cx = num(a["cx"]);
      const cy = num(a["cy"]);
      const r = num(a["r"]);
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    }
    case "ellipse": {
      const cx = num(a["cx"]);
      const cy = num(a["cy"]);
      const rx = num(a["rx"]);
      const ry = num(a["ry"]);
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
    }
    case "rect": {
      const x = num(a["x"]);
      const y = num(a["y"]);
      const w = num(a["width"]);
      const h = num(a["height"]);
      const rx = Math.min(num(a["rx"], num(a["ry"])), w / 2);
      const ry = Math.min(num(a["ry"], rx), h / 2);
      if (!rx) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
    }
    default:
      return null;
  }
}

function attrs(s: string): Attrs {
  const out: Attrs = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]!] = m[3] ?? m[4] ?? "";
  return out;
}

export interface SvgIcon {
  d: string[];
  viewBox: [number, number, number, number];
  /** True if the SVG draws lines (fill="none" with a stroke). */
  stroke: boolean;
  strokeWidth: number;
}

/** Read the shapes of an SVG icon. Returns null if it has no shapes. Transforms are not supported. */
export function iconFromSvg(svg: string): SvgIcon | null {
  const root = /<svg\b([^>]*)>/i.exec(svg);
  if (!root) return null;
  const ra = attrs(root[1]!);
  const vb = String(ra["viewBox"] ?? `0 0 ${num(ra["width"], 24)} ${num(ra["height"], 24)}`)
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBox: [number, number, number, number] = vb.length === 4 && vb.every(Number.isFinite) ? (vb as [number, number, number, number]) : [0, 0, 24, 24];
  const d: string[] = [];
  // Skip <defs>, <clipPath>, <mask>: they do not draw.
  const body = svg.replace(/<(defs|clipPath|mask|title|desc)\b[\s\S]*?<\/\1>/gi, "");
  for (const m of body.matchAll(/<(path|line|polyline|polygon|circle|ellipse|rect)\b([^>]*?)\/?>/gi)) {
    const a = attrs(m[2]!);
    if (a["fill"] === "none" && (a["stroke"] === undefined || a["stroke"] === "none") && ra["stroke"] === undefined) continue;
    const p = shapeToPath(m[1]!.toLowerCase(), a);
    if (p) d.push(p);
  }
  if (d.length === 0) return null;
  const stroke = ra["fill"] === "none" && ra["stroke"] !== undefined && ra["stroke"] !== "none";
  return { d, viewBox, stroke, strokeWidth: num(ra["stroke-width"], 2) };
}

/** A valid pack or icon name: lower case letters, digits, and "-". */
export function iconName(name: string): string {
  return name
    .replace(/\.svg$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Make an icon pack from SVG files. Files that do not convert go to `skipped`. */
export function iconPackFromSvgs(pack: string, files: { name: string; svg: string }[], license = "custom"): { pack: IconPack; skipped: string[] } {
  const icons: IconPack["icons"] = {};
  const skipped: string[] = [];
  const parsed: [string, SvgIcon][] = [];
  for (const f of files) {
    const name = iconName(f.name);
    const icon = name ? iconFromSvg(f.svg) : null;
    if (!icon) skipped.push(f.name);
    else parsed.push([name, icon]);
  }
  // The most common view box and kind are the pack values; other icons keep their own view box.
  const count = new Map<string, number>();
  for (const [, i] of parsed) count.set(i.viewBox.join(" "), (count.get(i.viewBox.join(" ")) ?? 0) + 1);
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "0 0 24 24";
  const viewBox = main.split(" ").map(Number) as [number, number, number, number];
  const strokeCount = parsed.filter(([, i]) => i.stroke).length;
  const kind = strokeCount * 2 >= parsed.length && parsed.length > 0 ? "stroke" : "fill";
  for (const [name, i] of parsed.sort((a, b) => a[0].localeCompare(b[0]))) {
    icons[name] = { d: i.d, tags: name.split("-"), ...(i.viewBox.join(" ") !== main ? { viewBox: i.viewBox } : {}) };
  }
  const strokeWidth = kind === "stroke" ? (parsed.find(([, i]) => i.stroke)?.[1].strokeWidth ?? 2) : 0;
  return { pack: { pack: iconName(pack) || "custom", license, kind, viewBox, strokeWidth, icons }, skipped };
}
