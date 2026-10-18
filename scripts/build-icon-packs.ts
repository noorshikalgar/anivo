/**
 * Build the bundled icon packs in assets/icons from the source npm packages.
 * Run after an update of lucide-static or @fluentui/svg-icons: pnpm build:icons
 *
 * Output format (one JSON file per pack):
 *   { pack, license, kind: "stroke" | "fill", viewBox, strokeWidth, icons: { name: { d: string[], tags: string[] } } }
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { shapeToPath } from "@anivo/render";

type Attrs = Record<string, string | number>;

function toPath(tag: string, a: Attrs): string {
  const d = shapeToPath(tag, a);
  if (d === null) throw new Error(`Unknown SVG element: ${tag}`);
  return d;
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
