/**
 * Automatic layout of elements (FR-CANVAS-16, docs/09 layout.apply).
 * Pure and deterministic: the same input gives the same positions.
 */

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export type LayoutKind = "row" | "column" | "grid" | "tree" | "layered";

export interface LayoutOptions {
  kind: LayoutKind;
  /** Space between elements, in scene pixels. Default 80 (layered: 140 between ranks). */
  gap?: number;
  /** Columns for a grid. Default: the square root of the count, rounded up. */
  cols?: number;
  /** Flow direction for layered and tree layouts. Default: right for layered, down for tree. */
  direction?: "right" | "down";
  /** Top-left corner of the result. */
  origin?: { x: number; y: number };
}

export type LayoutResult = Map<string, { x: number; y: number }>;

export function autoLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: LayoutOptions): LayoutResult {
  const origin = opts.origin ?? { x: 0, y: 0 };
  const out: LayoutResult = new Map();
  if (nodes.length === 0) return out;
  const gap = opts.gap ?? 80;

  if (opts.kind === "row" || opts.kind === "column") {
    const across = opts.kind === "row" ? Math.max(...nodes.map((n) => n.height)) : Math.max(...nodes.map((n) => n.width));
    let cursor = 0;
    for (const n of nodes) {
      if (opts.kind === "row") out.set(n.id, { x: origin.x + cursor, y: origin.y + (across - n.height) / 2 });
      else out.set(n.id, { x: origin.x + (across - n.width) / 2, y: origin.y + cursor });
      cursor += (opts.kind === "row" ? n.width : n.height) + gap;
    }
    return out;
  }

  if (opts.kind === "grid") {
    const cols = Math.max(1, opts.cols ?? Math.ceil(Math.sqrt(nodes.length)));
    const cw = Math.max(...nodes.map((n) => n.width));
    const ch = Math.max(...nodes.map((n) => n.height));
    nodes.forEach((n, i) => {
      out.set(n.id, { x: origin.x + (i % cols) * (cw + gap) + (cw - n.width) / 2, y: origin.y + Math.floor(i / cols) * (ch + gap) + (ch - n.height) / 2 });
    });
    return out;
  }

  // Layered layout (a small Sugiyama method): ranks, order in each rank, coordinates.
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const es = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  // 1. Remove back edges: a depth-first search along outgoing edges, in input order.
  // An edge to a node that is still on the search stack makes a cycle, so it is removed.
  const succ = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of es) succ.get(e.from)!.push(e.to);
  const kept: LayoutEdge[] = [];
  const mark = new Map<string, 1 | 2>();
  const dfs = (id: string) => {
    mark.set(id, 1);
    for (const to of succ.get(id)!) {
      const m = mark.get(to);
      if (m === 1) continue; // back edge
      kept.push({ from: id, to });
      if (m === undefined) dfs(to);
    }
    mark.set(id, 2);
  };
  nodes.forEach((n) => mark.has(n.id) || dfs(n.id));

  const out_ = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const in_ = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of kept) {
    out_.get(e.from)!.push(e.to);
    in_.get(e.to)!.push(e.from);
  }

  // Rank: the longest path from a source (the graph has no cycle now).
  const rank = new Map<string, number>();
  const visit = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    let r = 0;
    for (const p of in_.get(id)!) r = Math.max(r, visit(p) + 1);
    rank.set(id, r);
    return r;
  };
  nodes.forEach((n) => visit(n.id));

  // 2. Order in each rank: input order first, then barycenter sweeps (down, up, down).
  const ranks: string[][] = [];
  for (const n of nodes) (ranks[rank.get(n.id)!] ??= []).push(n.id);
  const position = new Map<string, number>();
  const index = () => ranks.forEach((r) => r.forEach((id, i) => position.set(id, i)));
  index();
  const sweep = (down: boolean) => {
    const order = down ? ranks.map((_, i) => i).slice(1) : ranks.map((_, i) => i).slice(0, -1).reverse();
    for (const ri of order) {
      const r = ranks[ri]!;
      const key = (id: string) => {
        const nb = (down ? in_ : out_).get(id)!.filter((x) => rank.get(x) === ri + (down ? -1 : 1));
        return nb.length ? nb.reduce((s, x) => s + position.get(x)!, 0) / nb.length : position.get(id)!;
      };
      const keys = new Map(r.map((id) => [id, key(id)]));
      r.sort((a, b) => keys.get(a)! - keys.get(b)! || position.get(a)! - position.get(b)!);
      r.forEach((id, i) => position.set(id, i));
    }
  };
  sweep(true);
  sweep(false);
  sweep(true);

  // 3. Coordinates. Each rank is centered on the widest rank.
  const horizontal = (opts.direction ?? (opts.kind === "tree" ? "down" : "right")) === "right";
  const rankGap = opts.gap !== undefined ? opts.gap : 140;
  const itemGap = opts.gap !== undefined ? Math.max(40, opts.gap * 0.6) : 60;
  const along = (n: LayoutNode) => (horizontal ? n.width : n.height);
  const acrossOf = (n: LayoutNode) => (horizontal ? n.height : n.width);
  const rankDepth = ranks.map((r) => Math.max(...r.map((id) => along(byId.get(id)!))));
  const rankSpan = ranks.map((r) => r.reduce((s, id) => s + acrossOf(byId.get(id)!), 0) + itemGap * (r.length - 1));
  const maxSpan = Math.max(...rankSpan);
  let depth = 0;
  ranks.forEach((r, ri) => {
    let cursor = (maxSpan - rankSpan[ri]!) / 2;
    for (const id of r) {
      const n = byId.get(id)!;
      const a = depth + (rankDepth[ri]! - along(n)) / 2;
      if (horizontal) out.set(id, { x: origin.x + a, y: origin.y + cursor });
      else out.set(id, { x: origin.x + cursor, y: origin.y + a });
      cursor += acrossOf(n) + itemGap;
    }
    depth += rankDepth[ri]! + rankGap;
  });
  return out;
}
