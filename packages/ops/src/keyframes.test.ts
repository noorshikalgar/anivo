import { evaluate, resolveTimeline } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { deleteKeyframeOps, keyframesIn, moveKeyframeOps, setKeyframeOps } from "./keyframes.js";

const make = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "K" },
    elements: { a: { type: "rectangle", z: "a0", x: 0, y: 0, width: 100, height: 100 } },
    steps: [{ id: "s1", holdMs: 0, actions: [{ id: "e", type: "enter", effect: "fade", targets: ["a"], durationMs: 100 }] }, { id: "s2", holdMs: 0, actions: [] }],
  });
  if (!r.ok) throw new Error("scene");
  return new OperationBus(r.scene);
};
const xAt = (bus: OperationBus, stepRel: number) => {
  const tl = resolveTimeline(bus.scene);
  return evaluate(bus.scene, tl.steps[1]!.startMs + stepRel).elements.find((e) => e.id === "a")!.x;
};

describe("keyframes", () => {
  it("sets keyframes at times: the element moves through them", () => {
    const bus = make();
    bus.apply({ ops: setKeyframeOps(bus.scene, "s2", "a", { x: 400 }, 1000) });
    bus.apply({ ops: setKeyframeOps(bus.scene, "s2", "a", { x: 100 }, 2000) });
    expect(keyframesIn(bus.scene, "s2").map((k) => [k.group, k.fromMs, k.timeMs])).toEqual([
      ["position", 0, 1000],
      ["position", 1000, 2000],
    ]);
    expect(xAt(bus, 1000)).toBeCloseTo(400, 0);
    expect(xAt(bus, 2000)).toBeCloseTo(100, 0);
  });

  it("a keyframe in between splits the tween, and the same time changes the value", () => {
    const bus = make();
    bus.apply({ ops: setKeyframeOps(bus.scene, "s2", "a", { x: 400 }, 2000) });
    bus.apply({ ops: setKeyframeOps(bus.scene, "s2", "a", { x: 50 }, 1000) });
    expect(keyframesIn(bus.scene, "s2").map((k) => [k.fromMs, k.timeMs])).toEqual([
      [0, 1000],
      [1000, 2000],
    ]);
    expect(xAt(bus, 1000)).toBeCloseTo(50, 0);
    bus.apply({ ops: setKeyframeOps(bus.scene, "s2", "a", { x: 60 }, 1010) });
    expect(keyframesIn(bus.scene, "s2")).toHaveLength(2);
    expect(xAt(bus, 1000)).toBeCloseTo(60, 0);
  });

  it("moves and deletes keyframes, and the next keyframe follows", () => {
    const bus = make();
    bus.apply({ ops: setKeyframeOps(bus.scene, "s2", "a", { x: 400 }, 1000) });
    bus.apply({ ops: setKeyframeOps(bus.scene, "s2", "a", { x: 100 }, 2000) });
    const [k1] = keyframesIn(bus.scene, "s2");
    bus.apply({ ops: moveKeyframeOps(bus.scene, "s2", k1!.actionId, 1500) });
    expect(keyframesIn(bus.scene, "s2").map((k) => [k.fromMs, k.timeMs])).toEqual([
      [0, 1500],
      [1500, 2000],
    ]);
    bus.apply({ ops: deleteKeyframeOps(bus.scene, "s2", k1!.actionId) });
    expect(keyframesIn(bus.scene, "s2").map((k) => [k.fromMs, k.timeMs])).toEqual([[0, 2000]]);
  });

  it("a hold key jumps at its time, with no tween", () => {
    const bus = make();
    const ops = setKeyframeOps(bus.scene, "s2", "a", { x: 400 }, 1000);
    const add = ops[0] as { action: Record<string, unknown> };
    add.action["easing"] = "hold";
    bus.apply({ ops });
    expect(xAt(bus, 990)).toBeCloseTo(0, 0);
    expect(xAt(bus, 1000)).toBeCloseTo(400, 0);
  });
});
