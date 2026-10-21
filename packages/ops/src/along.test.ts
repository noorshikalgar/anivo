import { evaluate } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { sendAlongOps } from "./along.js";
import { OperationBus } from "./bus.js";

const make = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "S" },
    elements: {
      a: { type: "rectangle", z: "a0", x: 0, y: 0, width: 100, height: 100 },
      b: { type: "rectangle", z: "a1", x: 600, y: 0, width: 100, height: 100 },
      c: { type: "connector", z: "a2", start: { kind: "bound", elementId: "a" }, end: { kind: "bound", elementId: "b" } },
      m: { type: "rectangle", z: "a3", x: 0, y: 200, width: 40, height: 40 },
    },
    steps: [{ id: "s1", holdMs: 0, actions: [] }],
  });
  if (!r.ok) throw new Error("scene");
  return new OperationBus(r.scene);
};
const center = (bus: OperationBus, t: number) => {
  const f = evaluate(bus.scene, t).elements.find((e) => e.id === "m")!;
  return { x: f.x + f.width / 2, y: f.y + f.height / 2 };
};

describe("send along a connector", () => {
  it("moves the element from the start to the end of the arrow", () => {
    const bus = make();
    expect(bus.apply({ ops: sendAlongOps(bus.scene, "s1", ["m"], "c") }).ok).toBe(true);
    expect(center(bus, 0).x).toBeLessThan(150);
    expect(center(bus, 1600).x).toBeGreaterThan(550);
    expect(center(bus, 1600).y).toBeCloseTo(50, 0);
  });

  it("back goes from the end to the start", () => {
    const bus = make();
    bus.apply({ ops: sendAlongOps(bus.scene, "s1", ["m"], "c", { reverse: true }) });
    expect(center(bus, 1600).x).toBeLessThan(150);
  });

  it("follows the arrow when an end element moves, in the same undo step", () => {
    const bus = make();
    bus.apply({ ops: sendAlongOps(bus.scene, "s1", ["m"], "c") });
    bus.apply({ ops: [{ op: "element.update", id: "b", set: { y: 400 } }] });
    expect(center(bus, 1600).y).toBeGreaterThan(400);
    bus.undo();
    expect(center(bus, 1600).y).toBeCloseTo(50, 0);
  });

  it("rename keeps the arrow and the caption anchor; remove keeps the last path", () => {
    const bus = make();
    bus.apply({ ops: [...sendAlongOps(bus.scene, "s1", ["m"], "c"), { op: "step.update", id: "s1", set: { caption: { text: "Hi", anchor: "b" } } }] });
    bus.apply({ ops: [{ op: "element.rename", id: "c", to: "c2" }, { op: "element.rename", id: "b", to: "bob" }] });
    let step = bus.scene.steps[0]!;
    const motion = step.actions[0]!.type === "motion" ? step.actions[0]!.motion : undefined;
    expect(motion?.along).toBe("c2");
    expect(step.caption?.anchor).toBe("bob");
    expect(bus.apply({ ops: [{ op: "element.remove", ids: ["c2"] }] }).ok).toBe(true);
    step = bus.scene.steps[0]!;
    expect(step.actions[0]).toMatchObject({ type: "motion" });
    expect((step.actions[0] as { motion: { along?: string } }).motion.along).toBeUndefined();
  });
});
