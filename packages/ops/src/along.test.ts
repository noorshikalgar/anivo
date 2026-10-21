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
  it("glides from where the element is onto the arrow (lead-in)", () => {
    const bus = make();
    bus.apply({ ops: sendAlongOps(bus.scene, "s1", ["m"], "c") });
    const a = bus.scene.steps[0]!.actions[0]!;
    if (a.type !== "motion") throw new Error("motion");
    expect(a.motion.points[0]).toEqual({ x: 20, y: 220 });
    expect(center(bus, 0)).toEqual({ x: 20, y: 220 });
  });

  it("moves the element from the start to the end of the arrow", () => {
    const bus = make();
    expect(bus.apply({ ops: sendAlongOps(bus.scene, "s1", ["m"], "c") }).ok).toBe(true);
    expect(center(bus, 0).x).toBeLessThan(150);
    expect(center(bus, 2400).x).toBeGreaterThan(550);
    expect(center(bus, 2400).y).toBeCloseTo(50, 0);
  });

  it("back goes from the end to the start", () => {
    const bus = make();
    bus.apply({ ops: sendAlongOps(bus.scene, "s1", ["m"], "c", { reverse: true }) });
    expect(center(bus, 2400).x).toBeLessThan(150);
  });

  it("follows the arrow when an end element moves, in the same undo step", () => {
    const bus = make();
    bus.apply({ ops: sendAlongOps(bus.scene, "s1", ["m"], "c") });
    bus.apply({ ops: [{ op: "element.update", id: "b", set: { y: 400 } }] });
    expect(center(bus, 2400).y).toBeGreaterThan(350);
    bus.undo();
    expect(center(bus, 2400).y).toBeCloseTo(50, 0);
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

describe("send along two arrows in two steps", () => {
  it("the second send starts where the first ended, not at the corner", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "Two" },
      elements: {
        a: { type: "rectangle", z: "a0", x: 0, y: 400, width: 100, height: 100 },
        s: { type: "rectangle", z: "a1", x: 600, y: 400, width: 100, height: 100 },
        b: { type: "rectangle", z: "a2", x: 1200, y: 400, width: 100, height: 100 },
        up: { type: "connector", z: "a3", start: { kind: "bound", elementId: "a" }, end: { kind: "bound", elementId: "s" } },
        down: { type: "connector", z: "a4", start: { kind: "bound", elementId: "s" }, end: { kind: "bound", elementId: "b" } },
        m: { type: "rectangle", z: "a5", x: 20, y: 200, width: 60, height: 40 },
      },
      steps: [
        { id: "s1", holdMs: 0, actions: [] },
        { id: "s2", holdMs: 0, actions: [] },
      ],
    });
    if (!r.ok) throw new Error("scene");
    const bus = new OperationBus(r.scene);
    // Both motions come in one transaction with placeholder points, as a script does.
    const placeholder = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    bus.apply({
      ops: [
        { op: "action.add", step: "s1", action: { type: "motion", targets: ["m"], durationMs: 1000, motion: { points: placeholder, along: "up" } } },
        { op: "action.add", step: "s2", action: { type: "motion", targets: ["m"], durationMs: 1000, motion: { points: placeholder, along: "down" } } },
      ],
    });
    const second = bus.scene.steps[1]!.actions[0]!;
    if (second.type !== "motion") throw new Error("motion");
    // The lead-in starts left of the server (where the first send ended), not at 0,0.
    expect(second.motion.points[0]!.x).toBeGreaterThan(400);
    expect(second.motion.points[0]!.y).toBeGreaterThan(400);
  });
});
