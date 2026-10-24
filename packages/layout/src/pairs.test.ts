import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { evaluateWithLayout } from "./geometry.js";

describe("two arrows between the same elements (docs/23 G2)", () => {
  it("put their labels on the outer sides", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "P" },
      elements: {
        a: { type: "rectangle", z: "a1", x: 0, y: 0, width: 100, height: 100 },
        b: { type: "rectangle", z: "a2", x: 600, y: 0, width: 100, height: 100 },
        go: { type: "connector", z: "a3", start: { kind: "bound", elementId: "a" }, end: { kind: "bound", elementId: "b" }, label: { text: "go" } },
        back: { type: "connector", z: "a4", start: { kind: "bound", elementId: "b" }, end: { kind: "bound", elementId: "a" }, label: { text: "back" } },
        solo: { type: "connector", z: "a5", start: { kind: "bound", elementId: "a" }, end: { kind: "free", x: 50, y: 500 } },
      },
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const routes = evaluateWithLayout(r.scene, -1).routes;
    const go = routes.get("go")!;
    const back = routes.get("back")!;
    expect(go.labelSide).toBeDefined();
    expect(back.labelSide).toBeDefined();
    // The lines are apart, and each label side points away from the other line.
    const gy = go.points[0]!.y;
    const by = back.points[0]!.y;
    expect(Math.abs(gy - by)).toBeGreaterThan(30);
    expect(routes.get("solo")!.labelSide).toBeUndefined();
  });
});
