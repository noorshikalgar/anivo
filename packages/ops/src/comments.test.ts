import { readFileSync } from "node:fs";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";

const r = loadScene(JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")));
if (!r.ok) throw new Error("fixture");

describe("comments (FR-SHARE-03)", () => {
  it("adds, answers, resolves, undoes, and removes with the element", () => {
    const bus = new OperationBus(r.scene);
    const a = bus.apply({ ops: [{ op: "comment.add", target: { kind: "element", id: "lb" }, text: "Make this bigger?", author: "Noor" }] });
    expect(a.ok && a.created).toEqual(["cm-1"]);
    expect(bus.apply({ ops: [{ op: "comment.add", target: { kind: "element", id: "lb" }, text: "Done.", author: "claude-code", replyTo: "cm-1" }] }).ok).toBe(true);
    expect(bus.apply({ ops: [{ op: "comment.update", id: "cm-1", set: { resolved: true } }] }).ok).toBe(true);
    expect(bus.scene.comments.map((c) => [c.id, c.author, c.resolved])).toEqual([["cm-1", "Noor", true], ["cm-2", "claude-code", false]]);
    bus.undo();
    expect(bus.scene.comments[0]!.resolved).toBe(false);
    expect(bus.apply({ ops: [{ op: "comment.add", target: { kind: "element", id: "nope" }, text: "x" }] }).ok).toBe(false);
    expect(bus.apply({ ops: [{ op: "element.remove", ids: ["lb"] }] }).ok).toBe(true);
    expect(bus.scene.comments).toEqual([]);
  });
});
