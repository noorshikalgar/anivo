import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import { resolveTimeline } from "./timeline.js";

describe("idle motion (docs/22 D6)", () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "I" },
    elements: { a: { type: "rectangle", z: "a1", x: 0, y: 100, width: 50, height: 50 } },
    steps: [{ id: "s", title: "S", actions: [{ id: "f", type: "emphasis", effect: "float", targets: ["a"] }] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  const scene = r.scene;
  const tl = resolveTimeline(scene);
  const y = (ms: number) => {
    const f = evaluate(scene, ms).elements.find((e) => e.id === "a")!;
    return f.y + f.offsetY;
  };
  it("starts and ends at rest, and moves softly in between", () => {
    expect(tl.steps[0]!.endMs).toBe(6000);
    expect(y(0)).toBeCloseTo(100);
    expect(y(6000)).toBeCloseTo(100);
    expect(Math.abs(y(750) - 100)).toBeGreaterThan(5);
    // No jump: frame to frame changes are small.
    for (let t = 0; t < 6000; t += 16) expect(Math.abs(y(t + 16) - y(t))).toBeLessThan(1);
  });
});
