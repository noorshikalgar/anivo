import { describe, expect, it } from "vitest";
import { autoLayout } from "./auto.js";

const n = (id: string, w = 100, h = 50) => ({ id, width: w, height: h });

describe("autoLayout", () => {
  it("places a row and a column with gaps", () => {
    const row = autoLayout([n("a"), n("b", 200, 80)], [], { kind: "row", gap: 20, origin: { x: 10, y: 10 } });
    expect(row.get("a")).toEqual({ x: 10, y: 25 });
    expect(row.get("b")).toEqual({ x: 130, y: 10 });
    const col = autoLayout([n("a"), n("b")], [], { kind: "column", gap: 20 });
    expect(col.get("b")).toEqual({ x: 0, y: 70 });
  });

  it("places a grid", () => {
    const g = autoLayout([n("a"), n("b"), n("c"), n("d")], [], { kind: "grid", gap: 10 });
    expect(g.get("d")).toEqual({ x: 110, y: 60 });
  });

  it("ranks a layered graph from left to right", () => {
    const g = autoLayout([n("db"), n("api"), n("web"), n("cache")], [
      { from: "web", to: "api" },
      { from: "api", to: "db" },
      { from: "api", to: "cache" },
    ], { kind: "layered" });
    expect(g.get("web")!.x).toBeLessThan(g.get("api")!.x);
    expect(g.get("api")!.x).toBeLessThan(g.get("db")!.x);
    expect(g.get("db")!.x).toBe(g.get("cache")!.x);
    expect(g.get("db")!.y).not.toBe(g.get("cache")!.y);
  });

  it("makes a tree from top to bottom and survives a cycle", () => {
    const g = autoLayout([n("a"), n("b"), n("c")], [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ], { kind: "tree" });
    expect(g.size).toBe(3);
    expect(g.get("a")!.y).toBeLessThan(g.get("b")!.y);
  });

  it("is deterministic", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => n(`n${i}`, 80 + i, 40));
    const edges = nodes.slice(1).map((x, i) => ({ from: `n${Math.floor(i / 3)}`, to: x.id }));
    expect([...autoLayout(nodes, edges, { kind: "layered" })]).toEqual([...autoLayout(nodes, edges, { kind: "layered" })]);
  });
});
