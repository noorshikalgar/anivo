/**
 * Build the bundled icon packs in assets/icons from the source npm packages.
 * Run after an update of lucide-static or @fluentui/svg-icons: pnpm build:icons
 *
 * Output format (one JSON file per pack):
 *   { pack, license, kind: "stroke" | "fill", viewBox, strokeWidth, icons: { name: { d: string[], tags: string[] } } }
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

type Attrs = Record<string, string | number>;
const n = (v: string | number | undefined, d = 0) => (v === undefined ? d : Number(v));

/** Convert one SVG shape element to path data. */
function toPath(tag: string, a: Attrs): string {
  switch (tag) {
    case "path":
      return String(a["d"]);
    case "line":
      return `M${n(a["x1"])} ${n(a["y1"])}L${n(a["x2"])} ${n(a["y2"])}`;
    case "polyline":
    case "polygon": {
      const pts = String(a["points"]).trim().split(/[\s,]+/).map(Number);
      let d = "";
      for (let i = 0; i < pts.length; i += 2) d += `${i === 0 ? "M" : "L"}${pts[i]} ${pts[i + 1]}`;
      return tag === "polygon" ? `${d}Z` : d;
    }
    case "circle": {
      const cx = n(a["cx"]), cy = n(a["cy"]), r = n(a["r"]);
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    }
    case "ellipse": {
      const cx = n(a["cx"]), cy = n(a["cy"]), rx = n(a["rx"]), ry = n(a["ry"]);
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
    }
    case "rect": {
      const x = n(a["x"]), y = n(a["y"]), w = n(a["width"]), h = n(a["height"]);
      const rx = Math.min(n(a["rx"], n(a["ry"])), w / 2);
      const ry = Math.min(n(a["ry"], rx), h / 2);
      if (!rx) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
    }
    default:
      throw new Error(`Unknown SVG element: ${tag}`);
  }
}

// Lucide: stroke icons.
const nodes = JSON.parse(readFileSync("node_modules/lucide-static/icon-nodes.json", "utf8")) as Record<string, [string, Attrs][]>;
const tags = JSON.parse(readFileSync("node_modules/lucide-static/tags.json", "utf8")) as Record<string, string[]>;
const lucideVersion = (JSON.parse(readFileSync("node_modules/lucide-static/package.json", "utf8")) as { version: string }).version;
const lucide: Record<string, { d: string[]; tags: string[] }> = {};
for (const name of Object.keys(nodes).sort()) {
  lucide[name] = { d: nodes[name]!.map(([tag, attrs]) => toPath(tag, attrs)), tags: tags[name] ?? [] };
}
writeFileSync(
  "assets/icons/lucide.json",
  JSON.stringify({ pack: "lucide", version: lucideVersion, license: "ISC", kind: "stroke", viewBox: [0, 0, 24, 24], strokeWidth: 2, icons: lucide }),
);

// Fluent System Icons: fill icons, 24 px regular style.
const dir = "node_modules/@fluentui/svg-icons/icons";
const fluentVersion = (JSON.parse(readFileSync("node_modules/@fluentui/svg-icons/package.json", "utf8")) as { version: string }).version;
const fluent: Record<string, { d: string[]; tags: string[] }> = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith("_24_regular.svg")).sort()) {
  const svg = readFileSync(`${dir}/${file}`, "utf8");
  const d = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);
  const name = file.replace(/_24_regular\.svg$/, "").replace(/_/g, "-");
  fluent[name] = { d, tags: name.split("-") };
}
writeFileSync(
  "assets/icons/fluent.json",
  JSON.stringify({ pack: "fluent", version: fluentVersion, license: "MIT", kind: "fill", viewBox: [0, 0, 24, 24], strokeWidth: 0, icons: fluent }),
);

console.log(`lucide: ${Object.keys(lucide).length} icons, fluent: ${Object.keys(fluent).length} icons`);
