import { evaluate } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { sendAlongOps } from "./along.js";

const make = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "F" },
    elements: {
      a: { type: "rectangle", z: "a0", x: 0, y: 0, width: 100, height: 100 },
      b: { type: "rectangle", z: "a1", x: 800, y: 0, width: 100, height: 100 },
      c: { type: "connector", z: "a2", start: { kind: "bound", elementId: "a" }, end: { kind: "bound", elementId: "b" } },
      pkt: { type: "rectangle", z: "a3", x: 0, y: 300, width: 120, height: 50 },
      tag: { type: "text", z: "a4", x: 0, y: 260, width: 120, height: 36, content: { text: "HTTPS" }, follow: "pkt" },
      dot: { type: "ellipse", z: "a5", x: 50, y: 230, width: 10, height: 10, follow: "tag" },
    },
    steps: [{ id: "s1", holdMs: 0, actions: [] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return new OperationBus(r.scene);
};
const at = (bus: OperationBus, id: string, t: number) => evaluate(bus.scene, t).elements.find((e) => e.id === id)!;

describe("follow", () => {
  it("a follower moves with its leader, and a chain adds up", () => {
    const bus = make();
    bus.apply({ ops: [{ op: "action.add", step: "s1", action: { type: "morph", targets: ["pkt"], to: { x: 400, y: 500 }, durationMs: 1000 } }] });
    expect(at(bus, "tag", 1000)).toMatchObject({ x: 400, y: 460 });
    expect(at(bus, "dot", 1000)).toMatchObject({ x: 450, y: 430 });
    expect(at(bus, "tag", -1)).toMatchObject({ x: 0, y: 260 });
  });

  it("follows a send along an arrow", () => {
    const bus = make();
    bus.apply({ ops: sendAlongOps(bus.scene, "s1", ["pkt"], "c") });
    const p = at(bus, "pkt", 2400);
    const t = at(bus, "tag", 2400);
    expect(t.x - p.x).toBeCloseTo(0, 0);
    expect(t.y - p.y).toBeCloseTo(-40, 0);
  });

  it("rename keeps follow; remove of the leader stops it; a cycle is not valid", () => {
    const bus = make();
    bus.apply({ ops: [{ op: "element.rename", id: "pkt", to: "packet" }] });
    expect(bus.scene.elements["tag"]!.follow).toBe("packet");
    bus.apply({ ops: [{ op: "element.remove", ids: ["packet"] }] });
    expect(bus.scene.elements["tag"]!.follow).toBeUndefined();
    expect(bus.apply({ ops: [{ op: "element.update", id: "dot", set: { follow: "dot" } }] }).ok).toBe(false);
  });
});
