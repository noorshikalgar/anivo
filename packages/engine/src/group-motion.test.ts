import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";

const scene = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "G" },
    elements: {
      g: { type: "group", z: "a0" },
      card: { type: "rectangle", z: "a1", parentId: "g", x: 0, y: 0, width: 200, height: 100 },
      tag: { type: "rectangle", z: "a2", parentId: "g", x: 20, y: 10, width: 80, height: 20 },
      other: { type: "rectangle", z: "a3", x: 900, y: 600, width: 100, height: 100 },
    },
    steps: [
      { id: "s", title: "S", caption: { text: "It moves", side: "auto" }, actions: [{ id: "m", type: "motion", targets: ["g"], durationMs: 1000, motion: { points: [{ x: 100, y: 50 }, { x: 700, y: 50 }] } }] },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.scene;
};

describe("a group that moves (audit e1)", () => {
  it("keeps its parts in their places", () => {
    const sc = scene();
    for (const t of [0, 500, 1000]) {
      const f = evaluate(sc, t).elements;
      const card = f.find((e) => e.id === "card")!;
      const tag = f.find((e) => e.id === "tag")!;
      expect(tag.x - card.x).toBeCloseTo(20);
      expect(tag.y - card.y).toBeCloseTo(10);
    }
    const end = evaluate(sc, 1000).elements.find((e) => e.id === "card")!;
    expect(end.x + end.width / 2).toBeCloseTo(700);
  });
  it("keeps the caption in one place while the elements move", () => {
    const sc = scene();
    const a = evaluate(sc, 300).caption!;
    const b = evaluate(sc, 900).caption!;
    expect(a.anchor).toEqual(b.anchor);
  });
});

describe("particles on an arrow that is not drawn yet", () => {
  it("do not show until the arrow shows", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "P" },
      elements: {
        a: { type: "rectangle", z: "a1", x: 0, y: 0, width: 100, height: 100 },
        b: { type: "rectangle", z: "a2", x: 600, y: 0, width: 100, height: 100 },
        ab: { type: "connector", z: "a3", visible: false, start: { kind: "bound", elementId: "a" }, end: { kind: "bound", elementId: "b" } },
      },
      steps: [{ id: "s", title: "S", actions: [{ id: "e", type: "enter", effect: "draw-on", targets: ["ab"], delayMs: 1000, durationMs: 500 }, { id: "f", type: "flow", targets: ["ab"], durationMs: 3000, flow: {} }] }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(evaluate(r.scene, 500).particles).toHaveLength(0);
    expect(evaluate(r.scene, 2500).particles.length).toBeGreaterThan(0);
  });
});
