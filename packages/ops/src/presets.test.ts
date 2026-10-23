import { evaluate } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { capturePreset, getPreset, presetOps } from "./presets.js";

const make = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "P" },
    elements: {
      a: { type: "rectangle", z: "a0", x: 0, y: 0, width: 100, height: 100 },
      b: { type: "rectangle", z: "a1", x: 200, y: 0, width: 100, height: 100 },
      n: { type: "text", z: "a2", x: 0, y: 300, width: 300, height: 60, content: { text: "99.9% uptime" } },
    },
    steps: [{ id: "s1", holdMs: 0, actions: [] }],
  });
  if (!r.ok) throw new Error("scene");
  return new OperationBus(r.scene);
};

describe("motion presets", () => {
  it("an each preset gives each target the actions, one after the other", () => {
    const bus = make();
    const ops = presetOps(bus.scene, "s1", getPreset("rise-in")!, ["a", "b"]);
    if ("error" in ops) throw new Error(ops.error);
    bus.apply({ ops });
    expect(bus.scene.steps[0]!.actions.map((x) => [x.type, x.targets, x.delayMs])).toEqual([
      ["enter", ["a"], 0],
      ["enter", ["b"], 120],
    ]);
  });

  it("count up reads the number of the text", () => {
    const bus = make();
    const ops = presetOps(bus.scene, "s1", getPreset("count-up")!, ["n"]);
    if ("error" in ops) throw new Error(ops.error);
    bus.apply({ ops });
    expect(bus.scene.steps[0]!.actions[0]).toMatchObject({ type: "counter", counter: { from: 0, to: 99.9, decimals: 1, format: "{n}% uptime" } });
    expect(evaluate(bus.scene, 1400).elements.find((e) => e.id === "n")!.label).toBe("99.9% uptime");
    expect("error" in (presetOps(bus.scene, "s1", getPreset("count-up")!, ["a"]) as object)).toBe(true);
  });

  it("captures actions as a preset, with roles, and applies it to other elements", () => {
    const bus = make();
    bus.apply({
      ops: [
        { op: "action.add", step: "s1", action: { id: "x1", type: "enter", effect: "pop", targets: ["a"], delayMs: 200 } },
        { op: "action.add", step: "s1", action: { id: "x2", type: "emphasis", effect: "pulse", targets: ["b"], delayMs: 700 } },
      ],
    });
    const p = capturePreset(bus.scene, "s1", ["x1", "x2"], "Pop then pulse", "u1");
    if ("error" in p) throw new Error(p.error);
    expect(p.mode).toBe("roles");
    const ops = presetOps(bus.scene, "s1", p, ["b", "a"], { delayMs: 1000 });
    if ("error" in ops) throw new Error(ops.error);
    bus.apply({ ops });
    const added = bus.scene.steps[0]!.actions.slice(2);
    expect(added.map((x) => [x.type, x.targets, x.delayMs])).toEqual([
      ["enter", ["b"], 1000],
      ["emphasis", ["a"], 1500],
    ]);
    expect("error" in (presetOps(bus.scene, "s1", p, ["a"]) as object)).toBe(true);
  });
});
