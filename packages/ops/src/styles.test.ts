import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { applyLookOps, lookOf } from "./styles.js";

describe("style presets (docs/21 C12)", () => {
  it("copies the look of an element to others, and a group gives it to its parts", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "S" },
      elements: {
        a: { type: "rectangle", z: "a1", x: 10, y: 0, width: 50, height: 50, style: { fill: "accent", cornerRadius: 16, shadow: "soft", origin: "top" } },
        g: { type: "group", z: "a2" },
        b: { type: "rectangle", z: "a3", parentId: "g", x: 100, y: 0, width: 50, height: 50, style: { stroke: "red", fill: "blue" } },
      },
      steps: [],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const bus = new OperationBus(r.scene);
    const look = lookOf(bus.scene, "a")!;
    expect(look).toEqual({ fill: "accent", cornerRadius: 16, shadow: "soft" });
    expect(bus.apply({ ops: applyLookOps(bus.scene, ["g"], look) }).ok).toBe(true);
    expect(bus.scene.elements["b"]!.style).toEqual({ fill: "accent", cornerRadius: 16, shadow: "soft" });
    expect(bus.scene.elements["b"]!.x).toBe(100);
  });
});
