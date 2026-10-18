import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { mixOklch, parseHex } from "./color.js";
import type { Ctx2D } from "./ctx.js";
import { renderScene } from "./render.js";
import { THEMES, getTheme, resolveToken } from "./theme.js";

const outDir = new URL("../../../tests/output/render/", import.meta.url);
mkdirSync(outDir, { recursive: true });

function load(input: unknown): Scene {
  const r = loadScene(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.scene;
}
const template = load(JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")));

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

  it("defines the same tokens in each theme, with text contrast of at least 4.5:1", () => {
    const keys = Object.keys(THEMES["slate-dark"]!.tokens).sort();
    const lum = (hex: string) => {
      const c = parseHex(hex);
      const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const contrast = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x! + 0.05) / (y! + 0.05);
    };
    expect(Object.keys(THEMES).length).toBeGreaterThanOrEqual(4);
    expect(Object.values(THEMES).filter((t) => t.dark)).toHaveLength(2);
    for (const t of Object.values(THEMES)) {
      expect(Object.keys(t.tokens).sort(), t.name).toEqual(keys);
      expect(contrast(t.tokens["text"]!, t.tokens["surface"]!), `${t.name} text on surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.tokens["text"]!, t.tokens["background"]!), `${t.name} text on background`).toBeGreaterThanOrEqual(4.5);
    }
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

describe("burned-in captions", () => {
  it("draws white text on a dark box at the bottom, only while the caption is on", () => {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d") as unknown as Ctx2D;
    const list = [{ startMs: 0, endMs: 1000, lines: ["Requests go to the load balancer"] }];
    const bottomRow = () => {
      const d = canvas.getContext("2d").getImageData(0, Math.round(H * 0.9), W, 1).data;
      let white = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! > 230 && d[i + 1]! > 230 && d[i + 2]! > 230) white++;
      return white;
    };
    renderScene(ctx, template, 500, { width: W, height: H, captions: { list } });
    writeFileSync(new URL("caption.png", outDir), canvas.toBuffer("image/png"));
    expect(bottomRow()).toBeGreaterThan(5);
    renderScene(ctx, template, 1500, { width: W, height: H, captions: { list } });
    expect(bottomRow()).toBe(0);
  });
});

describe("image element", () => {
  const ID = "0123456789abcdef";
  const scene = load({
    schemaVersion: 1,
    settings: { background: { kind: "solid", color: "#000000" } },
    assets: { [ID]: { id: ID, mime: "image/png", bytes: 10 } },
    elements: { pic: { id: "pic", z: "a0", type: "image", assetId: ID, x: 100, y: 100, width: 400, height: 400, fit: "contain" } },
  });

  it("draws a placeholder before the image is decoded, then the image with its fit", async () => {
    const { registerImage, fitRect } = await import("./images.js");
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d") as unknown as Ctx2D;
    const px = (x: number, y: number) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
    const sx = W / 1920;
    renderScene(ctx, scene, -1, { width: W, height: H });
    // Placeholder: a box in the surface-strong color, not the black background.
    expect(px(Math.round(300 * sx), Math.round(300 * sx))).not.toEqual([0, 0, 0, 255]);
    // A red 200x100 image: contain gives a 400x200 band in the middle of the 400x400 box.
    const img = createCanvas(200, 100);
    const g = img.getContext("2d");
    g.fillStyle = "#ff0000";
    g.fillRect(0, 0, 200, 100);
    registerImage(ID, img);
    renderScene(ctx, scene, -1, { width: W, height: H });
    writeFileSync(new URL("image.png", outDir), canvas.toBuffer("image/png"));
    expect(px(Math.round(300 * sx), Math.round(300 * sx))).toEqual([255, 0, 0, 255]);
    expect(px(Math.round(300 * sx), Math.round(120 * sx))).toEqual([0, 0, 0, 255]);
    expect(fitRect(200, 100, { x: 0, y: 0, width: 400, height: 400 }, "cover")).toEqual({ x: -200, y: 0, width: 800, height: 400 });
  });
});

describe("custom theme", () => {
  it("changes token colors of a built-in theme, in the scene", async () => {
    const { sceneTheme } = await import("./theme.js");
    const scene = load({
      schemaVersion: 1,
      settings: { theme: "brand", customTheme: { name: "brand", base: "slate-light", tokens: { background: "#ff0000", accent: "#00ff00" } } },
    });
    const t = sceneTheme(scene);
    expect(t.name).toBe("brand");
    expect(t.dark).toBe(false);
    expect(t.tokens["accent"]).toBe("#00ff00");
    expect(t.tokens["text"]).toBe(THEMES["slate-light"]!.tokens["text"]);
    const canvas = createCanvas(W, H);
    renderScene(canvas.getContext("2d") as unknown as Ctx2D, scene, -1, { width: W, height: H });
    expect([...canvas.getContext("2d").getImageData(5, 5, 1, 1).data]).toEqual([255, 0, 0, 255]);
    // Another theme name uses the built-in theme.
    expect(sceneTheme(scene, "night-dark").name).toBe("night-dark");
  });
});

describe("shape morph outline", () => {
  it("blends a rectangle into an ellipse with the same point count", async () => {
    const { blendOutlines, cleanOutline } = await import("./outline.js");
    const b = { x: 0, y: 0, width: 100, height: 100 };
    const r = cleanOutline("rectangle", b, 0);
    const e = cleanOutline("ellipse", b, 0);
    const half = blendOutlines(r, e, 0.5);
    expect(half.points.length).toBe(97);
    const corner = Math.min(...half.points.map((p) => Math.hypot(p.x, p.y)));
    // The rectangle corner (0,0) is at distance 0; the ellipse is about 20.7 away; the blend is between.
    expect(corner).toBeGreaterThan(3);
    expect(corner).toBeLessThan(20);
    const full = blendOutlines(r, e, 1);
    expect(Math.abs(Math.hypot(full.points[0]!.x - 50, full.points[0]!.y - 50) - 50)).toBeLessThan(1);
  });
});
