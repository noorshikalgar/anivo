import { describe, expect, it } from "vitest";
import { staggerRanks } from "./timeline.js";

describe("staggerRanks (docs/21 C6)", () => {
  it("keeps the order by default and reverses it", () => {
    expect(staggerRanks(4, undefined, "a")).toEqual([0, 1, 2, 3]);
    expect(staggerRanks(4, "reverse", "a")).toEqual([3, 2, 1, 0]);
  });
  it("starts from the center or from the edges", () => {
    expect(staggerRanks(5, "center", "a")).toEqual([2, 1, 0, 1, 2]);
    expect(staggerRanks(5, "edges", "a")).toEqual([0, 1, 2, 1, 0]);
    expect(staggerRanks(4, "center", "a")).toEqual([1, 0, 0, 1]);
  });
  it("shuffles the same way each time", () => {
    const r = staggerRanks(8, "random", "act-1");
    expect([...r].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(staggerRanks(8, "random", "act-1")).toEqual(r);
    expect(r).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("stagger with groups (audit e1)", () => {
  it("starts the parts of a group together, and staggers the named targets", async () => {
    const { loadScene } = await import("@anivo/schema");
    const { resolveTimeline } = await import("./timeline.js");
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "G" },
      elements: {
        g: { type: "group", z: "a0" },
        p1: { type: "rectangle", z: "a1", parentId: "g", width: 10, height: 10 },
        p2: { type: "rectangle", z: "a2", parentId: "g", width: 10, height: 10 },
        b: { type: "rectangle", z: "a3", width: 10, height: 10 },
      },
      steps: [{ id: "s", title: "S", actions: [{ id: "e", type: "enter", effect: "fade", targets: ["g", "b"], staggerMs: 200, durationMs: 300 }] }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const starts = Object.fromEntries(resolveTimeline(r.scene).steps[0]!.actions.map((x) => [x.target, x.startMs]));
    expect(starts).toEqual({ p1: 0, p2: 0, b: 200 });
  });
});
