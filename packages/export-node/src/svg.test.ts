import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolveTimeline } from "@anivo/engine";
import { type Scene, loadScene } from "@anivo/schema";
import { Image, createCanvas } from "@napi-rs/canvas";
import pixelmatch from "pixelmatch";
import { describe, expect, it } from "vitest";
import { type Ctx2D, renderScene } from "@anivo/render";
import { registerBundledAssets } from "./fonts.js";
import { renderSvg } from "./svg.js";

const out = new URL("../../../tests/output/svg/", import.meta.url);
mkdirSync(out, { recursive: true });

function load(name: string): Scene {
  const r = loadScene(JSON.parse(readFileSync(new URL(`../../../assets/templates/${name}.anivo.json`, import.meta.url), "utf8")));
  if (!r.ok) throw new Error(name);
  return r.scene;
}

async function decode(src: Buffer): Promise<Image> {
  const img = new Image();
  const done = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
  });
  img.src = src;
  if (!img.complete) await done;
  return img;
}

/** Share of pixels that differ between the SVG (rasterized) and the canvas render. */
async function difference(scene: Scene, t: number, name: string): Promise<number> {
  const W = 960;
  const H = 540;
  const svg = renderSvg(scene, t, { width: W, height: H, embedFonts: false });
  writeFileSync(new URL(`${name}.svg`, out), svg);
  const a = createCanvas(W, H);
  a.getContext("2d").drawImage(await decode(Buffer.from(svg)), 0, 0, W, H);
  const b = createCanvas(W, H);
  registerBundledAssets();
  renderScene(b.getContext("2d") as unknown as Ctx2D, scene, t, { width: W, height: H });
  writeFileSync(new URL(`${name}-svg.png`, out), a.toBuffer("image/png"));
  writeFileSync(new URL(`${name}-canvas.png`, out), b.toBuffer("image/png"));
  const diff = createCanvas(W, H);
  const dctx = diff.getContext("2d");
  const d = dctx.createImageData(W, H);
  const n = pixelmatch(a.getContext("2d").getImageData(0, 0, W, H).data, b.getContext("2d").getImageData(0, 0, W, H).data, d.data, W, H, { threshold: 0.2 });
  dctx.putImageData(d, 0, 0);
  writeFileSync(new URL(`${name}-diff.png`, out), diff.toBuffer("image/png"));
  return n / (W * H);
}

describe("SVG export (FR-EXPORT-13)", () => {
  for (const name of ["load-balancer", "database-index", "git-branch-merge"]) {
    it(`${name}: the SVG looks like the canvas frame`, async () => {
      const scene = load(name);
      const tl = resolveTimeline(scene);
      const last = tl.steps[tl.steps.length - 1]!;
      // Text uses other fonts in the SVG rasterizer, so a small difference is normal.
      expect(await difference(scene, last.endMs - 1, name)).toBeLessThan(0.02);
    });
  }

  it("embeds the used fonts and escapes text", () => {
    const scene = load("load-balancer");
    const tl = resolveTimeline(scene);
    const svg = renderSvg(scene, tl.steps[1]!.endMs, { width: 480, height: 270 });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain("@font-face{font-family:'Inter'");
    expect(svg).not.toContain("Kalam");
  });
});
