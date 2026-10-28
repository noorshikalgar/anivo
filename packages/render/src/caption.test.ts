import { describe, expect, it } from "vitest";
import { placeCaption } from "./render.js";

const cam = { x: 0, y: 0, width: 1920, height: 1080 };

// An element in the bottom band: the caption cannot be a subtitle there.
const band = { x: 0, y: 900, width: 1920, height: 180 };

describe("caption place", () => {
  it("is a subtitle at the bottom center when that place is free (docs/40)", () => {
    const p = placeCaption({ width: 1200, height: 80 }, { side: "auto", anchor: { x: 800, y: 300, width: 300, height: 100 } }, cam, []);
    expect(p.x).toBeCloseTo(360, 0);
    expect(p.y + 80).toBeGreaterThan(1000);
  });

  it("goes below the anchor when there is space", () => {
    const p = placeCaption({ width: 400, height: 80 }, { side: "auto", anchor: { x: 800, y: 300, width: 300, height: 100 } }, cam, [band]);
    expect(p.y).toBeGreaterThan(400);
    expect(p.x).toBeCloseTo(750, 0);
  });

  it("goes above when an element is below", () => {
    const below = { x: 700, y: 420, width: 500, height: 200 };
    const p = placeCaption({ width: 400, height: 80 }, { side: "auto", anchor: { x: 800, y: 300, width: 300, height: 100 } }, cam, [below, band]);
    expect(p.y + 80).toBeLessThanOrEqual(300);
  });

  it("stays inside the frame, and top uses a band", () => {
    const p = placeCaption({ width: 400, height: 80 }, { side: "below", anchor: { x: 1800, y: 1000, width: 100, height: 60 } }, cam, []);
    expect(p.x + 400).toBeLessThanOrEqual(1920);
    expect(p.y + 80).toBeLessThanOrEqual(1080);
    const top = placeCaption({ width: 400, height: 80 }, { side: "top" }, cam, []);
    expect(top).toEqual({ x: 760, y: Math.round(1080 * 0.04) });
  });
});

describe("caption place around a card", () => {
  it("a field inside a card: the caption goes next to the card, not over its text", () => {
    const card = { x: 100, y: 300, width: 480, height: 420 };
    const title = { x: 130, y: 320, width: 420, height: 64, text: true };
    const field = { x: 130, y: 410, width: 420, height: 60, text: true };
    const hash = { x: 130, y: 500, width: 420, height: 80, text: true };
    const prev = { x: 130, y: 610, width: 420, height: 80, text: true };
    const next = { x: 700, y: 300, width: 480, height: 420 };
    const p = placeCaption({ width: 420, height: 90 }, { side: "auto", anchor: field, anchorId: "f" }, cam, [card, title, hash, prev, next]);
    const r = { ...p, width: 420, height: 90 };
    const hits = (o: { x: number; y: number; width: number; height: number }) => r.x < o.x + o.width && r.x + r.width > o.x && r.y < o.y + o.height && r.y + r.height > o.y;
    expect([title, hash, prev].some(hits)).toBe(false);
  });
});

describe("motion blur", () => {
  it("draws faint copies of a fast element when motion blur is on", async () => {
    const { loadScene } = await import("@anivo/schema");
    const { renderScene } = await import("./render.js");
    const make = (blur: boolean) => {
      const r = loadScene({
        schemaVersion: 1,
        meta: { title: "B" },
        settings: { motionBlur: blur },
        elements: { a: { type: "rectangle", z: "a0", x: 0, y: 100, width: 100, height: 100 } },
        steps: [{ id: "s1", actions: [{ id: "m", type: "morph", targets: ["a"], to: { x: 1600 }, durationMs: 500, easing: "linear" }] }],
      });
      if (!r.ok) throw new Error("scene");
      return r.scene;
    };
    // Count fill calls with a recording context.
    const calls = (blur: boolean) => {
      let fills = 0;
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (t, k) => {
          if (k === "fill" || k === "fillRect") return () => void fills++;
          if (k === "measureText") return () => ({ width: 10 });
          if (k === "createLinearGradient") return () => ({ addColorStop: () => undefined });
          return k in t ? t[k as string] : () => undefined;
        },
        set: (t, k, v) => ((t[k as string] = v), true),
      });
      renderScene(ctx as never, make(blur), 250, { width: 960, height: 540 });
      return fills;
    };
    expect(calls(true)).toBeGreaterThan(calls(false));
  });
});

describe("caption lines (docs/40)", () => {
  it("are one line when they fit, else two lines of about the same length", async () => {
    const { createCanvas } = await import("@napi-rs/canvas");
    const { captionLines } = await import("./render.js");
    const ctx = createCanvas(10, 10).getContext("2d") as unknown as Parameters<typeof captionLines>[0];
    ctx.font = "40px sans-serif";
    expect(captionLines(ctx, "A short caption.", 1300)).toHaveLength(1);
    const long = "If one scale must reach eight, the sixteen levels are one apart. Now zero point four three rounds to zero.";
    const two = captionLines(ctx, long, 1300);
    expect(two).toHaveLength(2);
    const [a, b] = two.map((l) => ctx.measureText(l).width);
    expect(Math.abs(a! - b!)).toBeLessThan(0.25 * Math.max(a!, b!));
  });
});

describe("caption styles (docs/41)", () => {
  it("each style draws, and none draws no caption", async () => {
    const { createCanvas } = await import("@napi-rs/canvas");
    const { loadScene } = await import("@anivo/schema");
    const { evaluate } = await import("@anivo/engine");
    const { renderScene } = await import("./render.js");
    const make = (style: string) => {
      const r = loadScene({
        schemaVersion: 1,
        settings: { captionStyle: style },
        elements: { a: { type: "rectangle", z: "a1", x: 100, y: 100, width: 200, height: 100 } },
        steps: [{ id: "s", title: "S", caption: { text: "Each gene adds a small amount to the trait." }, actions: [{ id: "e", type: "enter", targets: ["a"], effect: "fade", durationMs: 300 }] }],
      });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.scene;
    };
    const pixels = (style: string) => {
      const scene = make(style);
      const canvas = createCanvas(960, 540);
      renderScene(canvas.getContext("2d") as never, scene, 2500, { width: 960, height: 540 });
      return canvas.getContext("2d").getImageData(0, 0, 960, 540).data;
    };
    const none = pixels("none");
    expect(evaluate(make("none"), 2500).caption).toBeUndefined();
    for (const style of ["card", "subtitle", "bar", "marker", "slam"]) {
      expect(evaluate(make(style), 2500).caption!.style).toBe(style);
      const px = pixels(style);
      let diff = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] !== none[i]) diff++;
      expect(diff, style).toBeGreaterThan(500);
    }
  });
});
