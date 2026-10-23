import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { exitForOps } from "./exits.js";

const make = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "X" },
    elements: { a: { type: "rectangle", z: "a1", x: 0, y: 0, width: 50, height: 50 } },
    steps: [
      { id: "s1", title: "In", actions: [{ id: "e1", type: "enter", effect: "slide", durationMs: 600, delayMs: 200, sound: "whoosh", params: { direction: "left" }, targets: ["a"] }] },
      { id: "s2", title: "Next", actions: [] },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return new OperationBus(r.scene);
};

describe("exitForOps (docs/21 C8)", () => {
  it("adds the same effect as an exit after the step content", () => {
    const bus = make();
    const ops = exitForOps(bus.scene, "s1", "e1", "after");
    if ("error" in ops) throw new Error(ops.error);
    expect(bus.apply({ label: "x", ops }).ok).toBe(true);
    const x = bus.scene.steps[0]!.actions[1]!;
    expect(x).toMatchObject({ type: "exit", effect: "slide", durationMs: 600, delayMs: 800, params: { direction: "left" }, targets: ["a"] });
    expect(x.sound).toBeUndefined();
  });
  it("adds it at the start of the next step", () => {
    const bus = make();
    const ops = exitForOps(bus.scene, "s1", "e1", "next-step");
    if ("error" in ops) throw new Error(ops.error);
    bus.apply({ label: "x", ops });
    expect(bus.scene.steps[1]!.actions[0]).toMatchObject({ type: "exit", effect: "slide", delayMs: 0 });
  });
  it("refuses an action that is not an enter", () => {
    expect(exitForOps(make().scene, "s1", "nope")).toHaveProperty("error");
  });
});
