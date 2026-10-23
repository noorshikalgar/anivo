import { evaluate, resolveTimeline } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { compositionOf, compositionSlots, insertCompositionOps } from "./compositions.js";

const make = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "C" },
    elements: {
      card: { type: "group", z: "a0" },
      bg: { type: "rectangle", z: "a1", parentId: "card", x: 500, y: 300, width: 300, height: 200 },
      title: { type: "text", z: "a2", parentId: "card", x: 520, y: 320, width: 260, height: 60, content: { text: "Hi" } },
      other: { type: "rectangle", z: "a3", x: 0, y: 0, width: 50, height: 50 },
    },
    steps: [
      { id: "s1", title: "Card", caption: { text: "A card", anchor: "bg" }, actions: [{ id: "e1", type: "enter", effect: "rise", targets: ["card"] }, { id: "e2", type: "enter", effect: "fade", targets: ["other"] }] },
      { id: "s2", title: "Mark", actions: [{ id: "m1", type: "mark", targets: ["title"], mark: { phrase: "Hi", color: "accent" } }] },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return new OperationBus(r.scene);
};

describe("compositions", () => {
  it("keeps the selected elements, their parts, and the steps that animate them", () => {
    const c = compositionOf(make().scene, ["card"], "Card", "c1");
    if ("error" in c) throw new Error(c.error);
    expect(c.elements.map((e) => e.id).sort()).toEqual(["bg", "card", "title"]);
    expect(c.steps.map((s) => [s.title, s.actions.map((a) => a.type)])).toEqual([
      ["Card", ["enter"]],
      ["Mark", ["mark"]],
    ]);
    expect([c.width, c.height]).toEqual([300, 200]);
  });

  it("inserts it again with new IDs, at a place, as new steps", () => {
    const bus = make();
    const c = compositionOf(bus.scene, ["card"], "Card", "c1");
    if ("error" in c) throw new Error(c.error);
    const ins = insertCompositionOps(bus.scene, c, { x: 100, y: 600 }, "s1");
    expect(bus.apply({ ops: ins.ops }).ok).toBe(true);
    expect(ins.ids).toEqual(["card-2"]);
    expect(bus.scene.elements["bg-2"]).toMatchObject({ parentId: "card-2", x: 100, y: 600 });
    expect(bus.scene.steps.map((s) => s.title)).toEqual(["Card", "Card", "Mark", "Mark"]);
    expect(bus.scene.steps[1]!.caption?.anchor).toBe("bg-2");
    const tl = resolveTimeline(bus.scene);
    const f = evaluate(bus.scene, tl.steps[2]!.holdEndMs - 1).elements.find((e) => e.id === "title-2")!;
    expect(f.marks?.[0]).toMatchObject({ color: "accent" });
  });
});

describe("composition slots (docs/21 C10)", () => {
  it("lists the texts and sets them when inserting", () => {
    const bus = make();
    const c = compositionOf(bus.scene, ["card"], "Card", "c1");
    if ("error" in c) throw new Error(c.error);
    expect(compositionSlots(c)).toEqual([{ id: "title", text: "Hi" }]);
    const ins = insertCompositionOps(bus.scene, c, { x: 0, y: 0 }, undefined, { title: "Hello" });
    expect(bus.apply({ ops: ins.ops }).ok).toBe(true);
    const t = bus.scene.elements["title-2"];
    expect(t?.type === "text" && t.content.text).toBe("Hello");
  });
});
