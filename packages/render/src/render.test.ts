import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { mixOklch, parseHex } from "./color.js";
import type { Ctx2D } from "./ctx.js";
import { renderScene } from "./render.js";
import { getTheme, resolveToken } from "./theme.js";

const outDir = new URL("../../../tests/output/render/", import.meta.url);
mkdirSync(outDir, { recursive: true });

function load(input: unknown): Scene {
  const r = loadScene(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.scene;
}
const template = load(JSON.parse(readFileSync(new URL("../../../assets/templates/load-balancer.anivo.json", import.meta.url), "utf8")));

const W = 960;
const H = 540;

function render(scene: Scene, t: number, name: string, style?: "clean" | "sketch") {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as Ctx2D;
  renderScene(ctx, scene, t, { width: W, height: H, ...(style ? { style } : {}) });
  writeFileSync(new URL(`${name}.png`, outDir), canvas.toBuffer("image/png"));
  return canvas.getContext("2d").getImageData(0, 0, W, H).data;
}

const px = (data: Uint8ClampedArray, x: number, y: number) => {
  const i = (Math.round(y) * W + Math.round(x)) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};

describe("color", () => {
  it("mixes in OKLCH and keeps the end colors", () => {
    const a = parseHex("#ff0000");
    const b = parseHex("#0000ff");
    const start = mixOklch(a, b, 0);
    expect(start.r).toBeCloseTo(1, 3);
    expect(start.b).toBeCloseTo(0, 3);
    const end = mixOklch(a, b, 1);
    expect(end.b).toBeCloseTo(1, 3);
  });

  it("resolves theme tokens", () => {
    const t = getTheme("slate-dark");
    expect(resolveToken(t, "accent", "fill", "rectangle")).toEqual(parseHex("#4C9AFF"));
    expect(resolveToken(t, "default", "fill", "text").a).toBe(0);
  });
});

describe("renderScene", () => {
  const bg = parseHex(getTheme("slate-dark").tokens["background"]!);
  const bgRgb = [bg.r, bg.g, bg.b].map((v) => Math.round(v * 255));

  it("draws only the background before step 1", () => {
    const data = render(template, 0, "t0000");
    expect(px(data, 365, 270)).toEqual(bgRgb);
  });

  it("draws the load balancer after it enters", () => {
    const data = render(template, 9000, "t9000-clean");
    // Center of the load balancer box: scene (730, 540) → half size (365, 270).
    expect(px(data, 365, 252)).not.toEqual(bgRgb);
  });

  it("renders a contact sheet of the template in both styles", () => {
    for (const t of [400, 1600, 2400, 3300, 5000, 8000]) {
      render(template, t, `clean-${t}`, "clean");
      render(template, t, `sketch-${t}`, "sketch");
    }
  });

  it("gives the same pixels for the same time (sketch seeds are stable)", () => {
    const a = render(template, 8000, "repeat-a", "sketch");
    const b = render(template, 8000, "repeat-b", "sketch");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
