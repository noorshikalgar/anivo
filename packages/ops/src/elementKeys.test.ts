import { evaluate } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { deleteElementKeyOps, moveElementKeyOps, setElementKeysOps } from "./elementKeys.js";

const bus = () => {
  const r = loadScene({ schemaVersion: 1, meta: { title: "K" }, elements: { a: { type: "text", z: "a1", x: 100, y: 100, width: 300, height: 80, content: { text: "Hi" } } } });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return new OperationBus(r.scene);
};
const op = (b: OperationBus) => (b.scene.elements["a"]!.keys ?? {}) as Record<string, { t: number; v: unknown }[]>;

describe("element key operations (docs/32)", () => {
  it("invisible at 0, visible at 1 s: two keys, then a fade in", () => {
    const b = bus();
    expect(b.apply({ ops: setElementKeysOps(b.scene, "a", { opacity: 0 }, 0) }).ok).toBe(true);
    expect(b.apply({ ops: setElementKeysOps(b.scene, "a", { opacity: 1 }, 1000) }).ok).toBe(true);
    expect(op(b).opacity!.map((k) => [k.t, k.v])).toEqual([[0, 0], [1000, 1]]);
    expect(evaluate(b.scene, 0).elements[0]!.opacity).toBe(0);
    expect(evaluate(b.scene, 1000).elements[0]!.opacity).toBe(1);
  });
  it("a first key after 0 keeps the old value at 0, so the change animates", () => {
    const b = bus();
    b.apply({ ops: setElementKeysOps(b.scene, "a", { x: 600 }, 2000, { x: 100 }) });
    expect(op(b).x!.map((k) => [k.t, k.v])).toEqual([[0, 100], [2000, 600]]);
  });
  it("moves a key to the very start, and deletes keys", () => {
    const b = bus();
    b.apply({ ops: setElementKeysOps(b.scene, "a", { opacity: 0 }, 300) });
    b.apply({ ops: setElementKeysOps(b.scene, "a", { opacity: 1 }, 1500) });
    expect(b.apply({ ops: moveElementKeyOps(b.scene, "a", "opacity", 300, -50) }).ok).toBe(true);
    expect(op(b).opacity![0]!.t).toBe(0);
    b.apply({ ops: deleteElementKeyOps(b.scene, "a", "opacity", 0) });
    b.apply({ ops: deleteElementKeyOps(b.scene, "a", "opacity", 1500) });
    expect(b.scene.elements["a"]!.keys).toBeUndefined();
  });
});
