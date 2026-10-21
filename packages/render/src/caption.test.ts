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
