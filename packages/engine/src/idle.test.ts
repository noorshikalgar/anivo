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

describe("annotations (docs/25 K1, K2)", () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "A" },
    elements: { a: { type: "rectangle", z: "a1", x: 0, y: 0, width: 50, height: 50 } },
    steps: [{ id: "s", title: "S", actions: [{ id: "c", type: "emphasis", effect: "circle", targets: ["a"] }, { id: "l", type: "emphasis", effect: "spotlight", targets: ["a"] }] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  const at = (t: number) => evaluate(r.scene, t).elements.find((e) => e.id === "a")!;
  it("draws the circle in, keeps it, and fades it; the spotlight comes and goes", () => {
    expect(at(375).circle?.p).toBeCloseTo(0.5);
    expect(at(1500).circle).toMatchObject({ p: 1, alpha: 1 });
    expect(at(1500).spotlight).toBe(1);
    expect(at(2500).circle).toBeUndefined();
    expect(at(2500).spotlight).toBeUndefined();
  });
});

describe("idle motion in a step with other actions", () => {
  it("fills the hold and does not make the step longer", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "I" },
      elements: { a: { type: "rectangle", z: "a1", x: 0, y: 100, width: 50, height: 50 } },
      steps: [{ id: "s", title: "S", holdMs: 1500, actions: [{ id: "e", type: "enter", effect: "pop", targets: ["a"], durationMs: 500 }, { id: "f", type: "emphasis", effect: "float", targets: ["a"], after: "e" }] }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const ts = resolveTimeline(r.scene).steps[0]!;
    expect(ts.endMs).toBe(500);
    expect(ts.holdEndMs).toBe(2000);
    expect(ts.actions.find((x) => x.action.id === "f")!.endMs).toBe(2000);
  });
});
