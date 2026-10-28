import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import { resolveTimeline } from "./timeline.js";

describe("step transition and exits", () => {
  it("does not show an element again that the new step removes at its start (no flash)", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "T" },
      elements: { a: { type: "rectangle", z: "a1", x: 0, y: 0, width: 100, height: 100 }, b: { type: "rectangle", z: "a2", x: 200, y: 0, width: 100, height: 100 } },
      steps: [
        { id: "s1", title: "One", actions: [{ id: "e1", type: "enter", targets: ["a"], effect: "fade", durationMs: 400 }] },
        { id: "s2", title: "Two", transition: { kind: "fade", durationMs: 600 }, actions: [{ id: "x1", type: "exit", targets: ["a"], effect: "fade", durationMs: 400 }, { id: "e2", type: "enter", targets: ["b"], effect: "fade", durationMs: 400, delayMs: 400 }] },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const start = resolveTimeline(r.scene).steps[1]!.startMs;
    const a = (t: number) => evaluate(r.scene, t).elements.find((e) => e.id === "a")!;
    // The first half: the old step, a shows while the screen fades.
    expect(a(start - 100).opacity).toBeCloseTo(1);
    // The second half: a does not come back.
    for (const dt of [0, 100, 200, 299]) expect(a(start + dt).opacity).toBe(0);
    // b enters normally after the transition.
    expect(evaluate(r.scene, start + 1000).elements.find((e) => e.id === "b")!.opacity).toBeCloseTo(1);
  });
});
