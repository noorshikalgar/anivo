import { evaluate, resolveTimeline } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { findArrowPath, messageBuild } from "./builds.js";
import { OperationBus } from "./bus.js";

const make = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "M" },
    elements: {
      alice: { type: "rectangle", z: "a0", x: 100, y: 400, width: 200, height: 120, label: { text: "Alice" } },
      server: { type: "rectangle", z: "a1", x: 800, y: 400, width: 200, height: 120, label: { text: "Server" } },
      bob: { type: "rectangle", z: "a2", x: 1500, y: 400, width: 200, height: 120, label: { text: "Bob" } },
      c1: { type: "connector", z: "a3", start: { kind: "bound", elementId: "alice" }, end: { kind: "bound", elementId: "server" } },
      c2: { type: "connector", z: "a4", start: { kind: "bound", elementId: "bob" }, end: { kind: "bound", elementId: "server" } },
    },
    steps: [{ id: "s1", actions: [{ id: "e", type: "enter", effect: "fade", targets: ["alice", "server", "bob", "c1", "c2"] }] }],
  });
  if (!r.ok) throw new Error("scene");
  return new OperationBus(r.scene);
};

describe("message build", () => {
  it("finds the arrow path in either direction", () => {
    expect(findArrowPath(make().scene, "alice", "bob")).toEqual([
      { arrow: "c1", reverse: false },
      { arrow: "c2", reverse: true },
    ]);
    expect(findArrowPath(make().scene, "alice", "alice")).toBeUndefined();
  });

  it("types the text, then sends the bubble through the server to Bob", () => {
    const bus = make();
    const b = messageBuild(bus.scene, { from: "alice", to: "bob", text: "Meet at 7?" });
    if ("error" in b) throw new Error(b.error);
    const r = bus.apply({ ops: b.ops });
    expect(r.ok ? "ok" : r.error.message).toBe("ok");
    const steps = bus.scene.steps;
    expect(steps.map((s) => s.caption?.text)).toEqual([undefined, "Alice types a message.", "The message goes to Bob."]);
    const tl = resolveTimeline(bus.scene);
    const end = evaluate(bus.scene, tl.steps[2]!.endMs).elements.find((e) => e.id === b.id)!;
    // It arrives next to Bob (x 1500), not on him.
    expect(end.x + end.width / 2).toBeGreaterThan(1300);
    expect(end.x + end.width).toBeLessThanOrEqual(1500);
    // Each hop takes 1.6 s: the send step is long enough to follow.
    expect(tl.steps[2]!.endMs - tl.steps[2]!.startMs).toBeGreaterThanOrEqual(3200);
  });

  it("says why when no arrows connect the two elements", () => {
    const bus = make();
    bus.apply({ ops: [{ op: "element.remove", ids: ["c2"] }] });
    const b = messageBuild(bus.scene, { from: "alice", to: "bob", text: "Hi" });
    expect("error" in b && b.error).toContain("No arrows");
  });
});
