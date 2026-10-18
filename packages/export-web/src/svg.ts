import { evaluateWithLayout } from "@anivo/layout";
import { SvgContext, getImage, renderFrame } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import { decodeSceneImages } from "./images.js";

const toBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * One frame as an SVG document in the browser (FR-EXPORT-13). `fonts` are WOFF2
 * files to embed (only the families that the SVG uses go in).
 */
export async function renderSvgWeb(scene: Scene, timeMs: number, opts: { width: number; height: number; assets?: Map<string, Uint8Array>; fonts?: { family: string; weight: string; bytes: Uint8Array }[] }): Promise<string> {
  await decodeSceneImages(scene, opts.assets);
  const hrefs = new Map<unknown, string>();
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "image") continue;
    const img = getImage(el.assetId);
    const bytes = opts.assets?.get(el.assetId);
    const mime = scene.assets[el.assetId]?.mime;
    if (img && bytes && mime) hrefs.set(img, `data:${mime};base64,${toBase64(bytes)}`);
  }
  const measurer = new OffscreenCanvas(4, 4).getContext("2d")!;
  const ctx = new SvgContext({
    width: opts.width,
    height: opts.height,
    measure: (font, text) => {
      measurer.font = font;
      return measurer.measureText(text).width;
    },
    imageHref: (img) => hrefs.get(img),
  });
  const { frame, routes } = evaluateWithLayout(scene, timeMs);
  renderFrame(ctx, scene, frame, routes, { width: opts.width, height: opts.height });
  const svg = ctx.toString();
  const faces = (opts.fonts ?? [])
    .filter((f) => svg.includes(`font-family="'${f.family}'`))
    .map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};src:url(data:font/woff2;base64,${toBase64(f.bytes)}) format('woff2')}`);
  return faces.length ? svg.replace(/(<svg[^>]*>)/, `$1<style>${faces.join("")}</style>`) : svg;
}
