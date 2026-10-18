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

import type { ElementFrame } from "@anivo/engine";
import type { ConnectorElement } from "@anivo/schema";
import { connectorRoutes } from "./geometry.js";

describe("connectorRoutes", () => {
  const frame = (id: string, x: number): ElementFrame =>
    ({ id, type: "rectangle", z: id, visible: true, x, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, scale: 1, offsetX: 0, offsetY: 0, strokeProgress: 1, fillProgress: 1, textReveal: 1, glow: 0, flash: 0, highlight: 0 }) as ElementFrame;
  const conn = (id: string, a: string, b: string): ConnectorElement =>
    ({ id, type: "connector", route: "straight", start: { kind: "bound", elementId: a, side: "auto", offset: 0 }, end: { kind: "bound", elementId: b, side: "auto", offset: 0 }, startHead: "none", endHead: "arrow" }) as ConnectorElement;

  it("moves two arrows between the same elements apart, in both directions", () => {
    const routes = connectorRoutes([conn("ab", "a", "b"), conn("ba", "b", "a")], [frame("a", 0), frame("b", 400)]);
    const yAB = routes.get("ab")!.points[0]!.y;
    const yBA = routes.get("ba")!.points[0]!.y;
    expect(Math.abs(yAB - yBA)).toBeCloseTo(44, 5);
  });

  it("ends an arrow to a group on the outline of the group elements", () => {
    const group = { ...frame("g", 0), type: "group", x: 0, y: 0, width: 0, height: 0 } as ElementFrame;
    const kids = [{ ...frame("k1", 600), parentId: "g" }, { ...frame("k2", 600), y: 200, parentId: "g" }] as ElementFrame[];
    const routes = connectorRoutes([conn("ag", "a", "g")], [frame("a", 0), group, ...kids]);
    const end = routes.get("ag")!.points.at(-1)!;
    expect(end.x).toBeGreaterThan(580);
    expect(end.x).toBeLessThan(600);
    expect(end.y).toBeGreaterThan(50);
  });

  it("keeps a single arrow on the center line", () => {
    const routes = connectorRoutes([conn("ab", "a", "b")], [frame("a", 0), frame("b", 400)]);
    expect(routes.get("ab")!.points[0]!.y).toBe(50);
  });
});
