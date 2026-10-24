import { resolveTimeline } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { paceOps } from "./pace.js";

describe("pace (docs/28 P1)", () => {
  it("makes the whole video slower by a factor, and undoes in one step", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "P" },
      elements: { a: { type: "rectangle", z: "a1", width: 50, height: 50 }, b: { type: "rectangle", z: "a2", x: 100, width: 50, height: 50 } },
      steps: [
        { id: "s1", title: "A", holdMs: 400, actions: [{ id: "e", type: "enter", effect: "fade", targets: ["a", "b"], staggerMs: 100, durationMs: 400 }] },
        { id: "s2", title: "B", transition: { kind: "fade", durationMs: 600 }, actions: [{ id: "p", type: "emphasis", effect: "pulse", targets: ["a"], delayMs: 200 }] },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const bus = new OperationBus(r.scene);
    const before = resolveTimeline(bus.scene).totalMs;
    expect(bus.apply({ label: "Slower", ops: paceOps(bus.scene, 1.5) }).ok).toBe(true);
    expect(resolveTimeline(bus.scene).totalMs).toBeCloseTo(before * 1.5, -1);
    expect(bus.scene.steps[1]!.transition?.durationMs).toBe(900);
    bus.undo();
    expect(resolveTimeline(bus.scene).totalMs).toBe(before);
  });
});
