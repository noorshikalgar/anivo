import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluateWithLayout } from "@anivo/layout";
import { SvgContext, getImage, renderFrame } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import { createCanvas } from "@napi-rs/canvas";
import { bundledFontsDir, registerBundledAssets } from "./fonts.js";
import { registerSceneImages } from "./images.js";

const FAMILY: Record<string, string> = { inter: "Inter", kalam: "Kalam", "jetbrains-mono": "JetBrains Mono" };

/** @font-face rules with the bundled fonts that the SVG uses, so the file shows the same text everywhere. */
function fontFaces(svg: string): string {
  const rules: string[] = [];
  for (const file of readdirSync(bundledFontsDir())) {
    const m = /^(.+)-latin-(\d+)-normal\.woff2$/.exec(file);
    const family = m ? FAMILY[m[1]!] : undefined;
    if (!m || !family || !svg.includes(`font-family="'${family}'`)) continue;
    const data = readFileSync(join(bundledFontsDir(), file)).toString("base64");
    rules.push(`@font-face{font-family:'${family}';font-weight:${m[2]};src:url(data:font/woff2;base64,${data}) format('woff2')}`);
  }
  return rules.length ? `<style>${rules.join("")}</style>` : "";
}

/** One frame as an SVG document (FR-EXPORT-13). Images are embedded as data URLs. */
export function renderSvg(scene: Scene, timeMs: number, opts: { width?: number; height?: number; assets?: Map<string, Uint8Array>; embedFonts?: boolean } = {}): string {
  registerBundledAssets();
  registerSceneImages(scene, opts.assets);
  const width = opts.width ?? scene.settings.video.width;
  const height = opts.height ?? scene.settings.video.height;
  const measurer = createCanvas(4, 4).getContext("2d");
  // Each image object maps back to its asset bytes.
  const hrefs = new Map<unknown, string>();
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "image") continue;
    const img = getImage(el.assetId);
    const bytes = opts.assets?.get(el.assetId);
    const mime = scene.assets[el.assetId]?.mime;
    if (img && bytes && mime) hrefs.set(img, `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`);
  }
  const ctx = new SvgContext({
    width,
    height,
    measure: (font, text) => {
      measurer.font = font;
      return measurer.measureText(text).width;
    },
    imageHref: (img) => hrefs.get(img),
  });
  const { frame, routes } = evaluateWithLayout(scene, timeMs);
  renderFrame(ctx, scene, frame, routes, { width, height });
  const svg = ctx.toString();
  return opts.embedFonts === false ? svg : svg.replace(/(<svg[^>]*>)/, `$1${fontFaces(svg)}`);
}
