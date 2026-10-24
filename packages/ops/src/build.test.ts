import { resolveTimeline } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { buildOps } from "./build.js";

describe("build (docs/30 B1)", () => {
  it("raises the shapes in reading order, then draws their arrows after them", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "B" },
      elements: {
        c: { type: "rectangle", z: "a1", x: 600, y: 400, width: 100, height: 60 },
        a: { type: "rectangle", z: "a2", x: 0, y: 0, width: 100, height: 60 },
        b: { type: "rectangle", z: "a3", x: 600, y: 0, width: 100, height: 60 },
        ab: { type: "connector", z: "a4", start: { kind: "bound", elementId: "a" }, end: { kind: "bound", elementId: "b" } },
        bc: { type: "connector", z: "a5", start: { kind: "bound", elementId: "b" }, end: { kind: "bound", elementId: "c" } },
      },
      steps: [{ id: "s", title: "S" }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const bus = new OperationBus(r.scene);
    const ops = buildOps(bus.scene, "s", ["c", "a", "b"]);
    if ("error" in ops) throw new Error(ops.error);
    expect(bus.apply({ ops }).ok).toBe(true);
    const [shapes, arrows] = bus.scene.steps[0]!.actions;
    expect(shapes!.targets).toEqual(["a", "b", "c"]);
    expect(arrows!.targets.sort()).toEqual(["ab", "bc"]);
    const t = resolveTimeline(bus.scene).steps[0]!.actions;
    const lastShape = Math.max(...t.filter((x) => x.action.id === shapes!.id).map((x) => x.endMs));
    expect(Math.min(...t.filter((x) => x.action.id === arrows!.id).map((x) => x.startMs))).toBe(lastShape);
  });
});
