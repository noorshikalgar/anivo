import { describe, expect, it } from "vitest";
import { placeCaption } from "./render.js";

const cam = { x: 0, y: 0, width: 1920, height: 1080 };

describe("caption place", () => {
  it("goes below the anchor when there is space", () => {
    const p = placeCaption({ width: 400, height: 80 }, { side: "auto", anchor: { x: 800, y: 300, width: 300, height: 100 } }, cam, []);
    expect(p.y).toBeGreaterThan(400);
    expect(p.x).toBeCloseTo(750, 0);
  });

  it("goes above when an element is below", () => {
    const below = { x: 700, y: 420, width: 500, height: 200 };
    const p = placeCaption({ width: 400, height: 80 }, { side: "auto", anchor: { x: 800, y: 300, width: 300, height: 100 } }, cam, [below]);
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
