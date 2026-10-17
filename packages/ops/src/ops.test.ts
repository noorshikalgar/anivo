import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import type { OperationInput } from "./operations.js";
import { keyBetween } from "./order.js";

function empty(): Scene {
  const r = loadScene({ schemaVersion: 1 });
  if (!r.ok) throw new Error("empty scene");
  return r.scene;
}

function busWith(ops: OperationInput[]): OperationBus {
  const bus = new OperationBus(empty());
  const r = bus.apply({ ops });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return bus;
}

const base: OperationInput[] = [
  { op: "element.add", type: "rectangle", props: { label: "User", x: 0, y: 0, width: 100, height: 60 } },
  { op: "element.add", type: "rectangle", props: { label: "Load balancer", x: 300, y: 0, width: 200, height: 80 } },
  { op: "element.connect", from: "user", to: "load-balancer" },
  { op: "step.add", props: { title: "Show user", actions: [{ type: "enter", effect: "pop", targets: ["user"] }] } },
  { op: "step.add", props: { title: "Traffic", actions: [{ type: "flow", targets: ["c-user-load-balancer"] }] } },
];

describe("keyBetween", () => {
  it("makes keys that sort between their neighbors", () => {
    const keys = [keyBetween(null, null)];
    for (let i = 0; i < 50; i++) keys.push(keyBetween(keys[keys.length - 1]!, null));
    for (let i = 0; i < 50; i++) keys.unshift(keyBetween(null, keys[0]!));
    for (let i = 0; i < 50; i++) keys.splice(51, 0, keyBetween(keys[50]!, keys[51]!));
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("works with the keys of the templates", () => {
    const k = keyBetween("a0", "a1");
    expect(k > "a0" && k < "a1").toBe(true);
  });
});

describe("OperationBus", () => {
  it("adds elements with readable IDs from labels", () => {
    const bus = busWith(base);
    expect(Object.keys(bus.scene.elements).sort()).toEqual(["c-user-load-balancer", "load-balancer", "user"]);
    expect(bus.scene.elements["user"]?.label?.text).toBe("User");
    expect(bus.scene.steps.map((s) => s.id)).toEqual(["s-show-user", "s-traffic"]);
    expect(bus.scene.steps[0]!.actions[0]!.id).toBe("a1");
  });

  it("makes IDs unique", () => {
    const bus = busWith([
      { op: "element.add", type: "rectangle", props: { label: "Pod" } },
      { op: "element.add", type: "rectangle", props: { label: "Pod" } },
    ]);
    expect(Object.keys(bus.scene.elements).sort()).toEqual(["pod", "pod-2"]);
  });

  it("puts new elements on top of the draw order", () => {
    const bus = busWith(base);
    const z = (id: string) => bus.scene.elements[id]!.z;
    expect(z("user") < z("load-balancer")).toBe(true);
    expect(z("load-balancer") < z("c-user-load-balancer")).toBe(true);
  });

  it("applies nothing if one operation fails", () => {
    const bus = busWith(base);
    const before = bus.scene;
    const r = bus.apply({
      ops: [
        { op: "element.update", id: "user", set: { x: 999 } },
        { op: "action.add", step: "s-traffic", action: { type: "enter", effect: "fade", targets: ["pod-9"] } },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("unknown-element");
    expect(r.error.path).toBe("ops.1.action.targets.0");
    expect(r.error.hint).toContain("Use one of:");
    expect(bus.scene).toBe(before);
    expect(bus.scene.elements["user"]!.x).toBe(0);
  });

  it("rejects an unknown operation with a hint", () => {
    const r = new OperationBus(empty()).apply({ ops: [{ op: "element.paint" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.hint).toContain("element.add");
  });

  it("merges style and removes properties set to null", () => {
    const bus = busWith(base);
    bus.apply({ ops: [{ op: "element.update", id: "user", set: { style: { fill: "accent" } } }] });
    bus.apply({ ops: [{ op: "element.update", id: "user", set: { style: { stroke: "danger" } } }] });
    expect(bus.scene.elements["user"]!.style).toEqual({ fill: "accent", stroke: "danger" });
    bus.apply({ ops: [{ op: "element.update", id: "user", set: { label: null, style: { fill: null } } }] });
    expect(bus.scene.elements["user"]!.label).toBeUndefined();
    expect(bus.scene.elements["user"]!.style).toEqual({ stroke: "danger" });
  });

  it("frees connector ends and removes empty actions when an element is removed", () => {
    const bus = busWith(base);
    const r = bus.apply({ ops: [{ op: "element.remove", ids: ["user"] }] });
    expect(r.ok).toBe(true);
    const c = bus.scene.elements["c-user-load-balancer"];
    expect(c?.type === "connector" && c.start.kind).toBe("free");
    expect(bus.scene.steps[0]!.actions).toHaveLength(0);
  });

  it("renames an element and updates all references", () => {
    const bus = busWith(base);
    const r = bus.apply({ ops: [{ op: "element.rename", id: "load-balancer", to: "lb" }] });
    expect(r.ok).toBe(true);
    expect(bus.scene.elements["load-balancer"]).toBeUndefined();
    const c = bus.scene.elements["c-user-load-balancer"];
    expect(c?.type === "connector" && c.end.kind === "bound" && c.end.elementId).toBe("lb");
  });

  it("places an element relative to another element", () => {
    const bus = busWith(base);
    bus.apply({ ops: [{ op: "element.place", id: "load-balancer", rightOf: "user", gap: 150 }] });
    const lb = bus.scene.elements["load-balancer"]!;
    expect(lb.x).toBe(250);
    expect(lb.y).toBe(-10);
  });

  it("reorders elements", () => {
    const bus = busWith(base);
    bus.apply({ ops: [{ op: "element.reorder", id: "user", to: "front" }] });
    const ids = Object.values(bus.scene.elements).sort((a, b) => (a.z < b.z ? -1 : 1)).map((e) => e.id);
    expect(ids[ids.length - 1]).toBe("user");
    bus.apply({ ops: [{ op: "element.reorder", id: "user", to: "back" }] });
    const ids2 = Object.values(bus.scene.elements).sort((a, b) => (a.z < b.z ? -1 : 1)).map((e) => e.id);
    expect(ids2[0]).toBe("user");
  });

  it("moves, updates, and removes steps and actions", () => {
    const bus = busWith(base);
    bus.apply({ ops: [{ op: "step.move", id: "s-traffic", index: 0 }] });
    expect(bus.scene.steps.map((s) => s.id)).toEqual(["s-traffic", "s-show-user"]);
    bus.apply({ ops: [{ op: "step.update", id: "s-traffic", set: { holdMs: 2000, title: "Requests" } }] });
    expect(bus.scene.steps[0]).toMatchObject({ holdMs: 2000, title: "Requests" });
    bus.apply({ ops: [{ op: "action.update", step: "s-show-user", id: "a1", set: { effect: "fade", durationMs: 900 } }] });
    expect(bus.scene.steps[1]!.actions[0]).toMatchObject({ effect: "fade", durationMs: 900 });
    bus.apply({ ops: [{ op: "action.remove", step: "s-show-user", id: "a1" }] });
    expect(bus.scene.steps[1]!.actions).toHaveLength(0);
    bus.apply({ ops: [{ op: "step.remove", id: "s-show-user" }] });
    expect(bus.scene.steps).toHaveLength(1);
  });

  it("merges nested settings", () => {
    const bus = busWith(base);
    bus.apply({ ops: [{ op: "scene.settings", set: { style: "sketch", video: { fps: 30 } } }] });
    expect(bus.scene.settings.style).toBe("sketch");
    expect(bus.scene.settings.video).toEqual({ width: 1920, height: 1080, fps: 30 });
  });

  it("undoes and redoes a transaction exactly", () => {
    const bus = busWith(base);
    const before = bus.scene;
    bus.apply({ label: "Move", ops: [{ op: "element.update", id: "user", set: { x: 50 } }, { op: "step.remove", id: "s-traffic" }] });
    const after = bus.scene;
    expect(bus.undo()).toBe(true);
    expect(bus.scene).toEqual(before);
    expect(bus.redo()).toBe(true);
    expect(bus.scene).toEqual(after);
  });

  it("clears the redo stack after a new transaction", () => {
    const bus = busWith(base);
    bus.apply({ ops: [{ op: "element.update", id: "user", set: { x: 50 } }] });
    bus.undo();
    expect(bus.canRedo).toBe(true);
    bus.apply({ ops: [{ op: "element.update", id: "user", set: { x: 70 } }] });
    expect(bus.canRedo).toBe(false);
  });

  it("undoes many random transactions back to the start (property)", () => {
    let seed = 7;
    const rand = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    const bus = busWith(base);
    const start = bus.scene;
    let applied = 0;
    for (let i = 0; i < 200; i++) {
      const ids = Object.keys(bus.scene.elements);
      const pick = ids[rand(ids.length)] ?? "user";
      const choices: OperationInput[] = [
        { op: "element.add", type: "ellipse", props: { label: `n${i}`, x: rand(1000), y: rand(1000), width: 50, height: 50 } },
        { op: "element.update", id: pick, set: { x: rand(1000), opacity: rand(100) / 100 } },
        { op: "element.remove", ids: [pick] },
        { op: "element.reorder", id: pick, to: "front" },
        { op: "step.add", props: { title: `t${i}` } },
      ];
      if (bus.apply({ ops: [choices[rand(choices.length)]!] }).ok) applied++;
    }
    expect(applied).toBeGreaterThan(150);
    // Undo only the random transactions. The setup transaction stays.
    for (let i = 0; i < applied; i++) expect(bus.undo()).toBe(true);
    expect(Object.keys(bus.scene.elements).sort()).toEqual(Object.keys(start.elements).sort());
    for (const id of Object.keys(start.elements)) expect(bus.scene.elements[id], id).toEqual(start.elements[id]);
    expect(bus.scene.steps).toEqual(start.steps);
    expect(bus.scene).toEqual(start);
  });

  it("reports a conflict when an element changed after the base version", () => {
    const bus = busWith(base);
    const seen = bus.version;
    bus.apply({ author: { kind: "user" }, ops: [{ op: "element.update", id: "user", set: { x: 10 } }] });
    const agent = bus.apply({ author: { kind: "agent", name: "test" }, baseVersion: seen, ops: [{ op: "element.update", id: "user", set: { x: 20 } }] });
    expect(agent.ok).toBe(false);
    if (!agent.ok) expect(agent.error.code).toBe("conflict");
    const other = bus.apply({ author: { kind: "agent", name: "test" }, baseVersion: seen, ops: [{ op: "element.update", id: "load-balancer", set: { x: 20 } }] });
    expect(other.ok).toBe(true);
  });

  it("records the author of each transaction and notifies listeners", () => {
    const bus = busWith(base);
    const seen: string[] = [];
    bus.subscribe((_, e) => seen.push(`${e.author.kind}:${e.label}`));
    bus.apply({ author: { kind: "agent", name: "claude-code" }, label: "Add pod", ops: [{ op: "element.add", type: "rectangle", props: { label: "Pod" } }] });
    expect(bus.history[bus.history.length - 1]!.author).toEqual({ kind: "agent", name: "claude-code" });
    bus.undo();
    expect(seen).toEqual(["agent:Add pod", "undo:Undo Add pod"]);
  });

  it("does not change the old scene object (immutability)", () => {
    const bus = busWith(base);
    const old = bus.scene;
    const json = JSON.stringify(old);
    bus.apply({ ops: [{ op: "element.update", id: "user", set: { x: 1 } }, { op: "action.update", step: "s-show-user", id: "a1", set: { durationMs: 10 } }] });
    expect(JSON.stringify(old)).toBe(json);
    // Unchanged elements are shared.
    expect(bus.scene.elements["load-balancer"]).toBe(old.elements["load-balancer"]);
  });
});
