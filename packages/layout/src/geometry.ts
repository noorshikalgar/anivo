import { type ElementFrame, type FrameState, evaluate } from "@anivo/engine";
import type { ConnectorElement, ConnectorEnd, Point, Scene } from "@anivo/schema";

/** An open or closed polyline with its cumulative lengths. */
export interface Polyline {
  points: Point[];
  /** `lengths[i]` is the path length from `points[0]` to `points[i]`. */
  lengths: number[];
  length: number;
}

export function polyline(points: Point[]): Polyline {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { points, lengths, length: lengths[lengths.length - 1] ?? 0 };
}

/** Point and unit direction at `distance` along the polyline. */
export function pointAt(line: Polyline, distance: number): { point: Point; dir: Point } {
  const { points, lengths } = line;
  if (points.length === 0) return { point: { x: 0, y: 0 }, dir: { x: 1, y: 0 } };
  if (points.length === 1) return { point: points[0]!, dir: { x: 1, y: 0 } };
  const d = Math.max(0, Math.min(distance, line.length));
  let i = 1;
  while (i < points.length - 1 && lengths[i]! < d) i++;
  const a = points[i - 1]!;
  const b = points[i]!;
  const seg = lengths[i]! - lengths[i - 1]!;
  const t = seg === 0 ? 0 : (d - lengths[i - 1]!) / seg;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
}

/** The first `distance` of the polyline, as a new list of points. */
export function slice(line: Polyline, distance: number): Point[] {
  const { points, lengths } = line;
  if (distance >= line.length) return points;
  if (distance <= 0 || points.length === 0) return points.slice(0, 1);
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    if (lengths[i]! <= distance) {
      out.push(points[i]!);
      continue;
    }
    out.push(pointAt(line, distance).point);
    break;
  }
  return out;
}

/** The box of an element in a frame, after offset and scale around its center. */
export function frameBox(f: ElementFrame): { x: number; y: number; width: number; height: number; cx: number; cy: number } {
  const cx = f.x + f.width / 2 + f.offsetX;
  const cy = f.y + f.height / 2 + f.offsetY;
  const width = f.width * f.scale;
  const height = f.height * f.scale;
  return { x: cx - width / 2, y: cy - height / 2, width, height, cx, cy };
}

/** Point on the outline of an element, on the ray from its center toward `toward`. */
export function boundaryPoint(f: ElementFrame, toward: Point, gap = 6): Point {
  const b = frameBox(f);
  const dx = toward.x - b.cx;
  const dy = toward.y - b.cy;
  if (dx === 0 && dy === 0) return { x: b.cx, y: b.cy };
  const hw = b.width / 2;
  const hh = b.height / 2;
  let t: number;
  if (f.type === "ellipse") {
    t = 1 / Math.sqrt((dx * dx) / (hw * hw || 1) + (dy * dy) / (hh * hh || 1));
  } else if (f.type === "diamond") {
    t = 1 / (Math.abs(dx) / (hw || 1) + Math.abs(dy) / (hh || 1));
  } else {
    t = Math.min(hw / (Math.abs(dx) || 1e-9), hh / (Math.abs(dy) || 1e-9));
  }
  const len = Math.hypot(dx, dy);
  const extra = gap / len;
  return { x: b.cx + dx * (t + extra), y: b.cy + dy * (t + extra) };
}

function endAnchor(end: ConnectorEnd, frames: Map<string, ElementFrame>): { point: Point; frame?: ElementFrame } {
  if (end.kind === "free") return { point: { x: end.x, y: end.y } };
  const f = frames.get(end.elementId);
  if (!f) return { point: { x: 0, y: 0 } };
  const b = frameBox(f);
  return { point: { x: b.cx, y: b.cy }, frame: f };
}

/**
 * Route of a connector in a frame. The route is calculated from the bound
 * element boxes, so it follows the elements when they move (FR-CANVAS-05).
 */
export function connectorRoute(c: ConnectorElement, frames: Map<string, ElementFrame>, sideOffset = 0): Polyline {
  const s0 = endAnchor(c.start, frames);
  const e0 = endAnchor(c.end, frames);
  // A side offset moves the line parallel to itself, so two arrows between the same elements do not cover each other.
  let s = s0;
  let e = e0;
  if (sideOffset !== 0) {
    const dx = e0.point.x - s0.point.x;
    const dy = e0.point.y - s0.point.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * sideOffset;
    const ny = (dx / len) * sideOffset;
    s = { ...s0, point: { x: s0.point.x + nx, y: s0.point.y + ny } };
    e = { ...e0, point: { x: e0.point.x + nx, y: e0.point.y + ny } };
  }
  const via = c.waypoints ?? [];
  const firstToward = via[0] ?? e.point;
  const lastToward = via[via.length - 1] ?? s.point;
  const start = s.frame ? offsetBoundary(s.frame, firstToward, s.point) : s.point;
  const end = e.frame ? offsetBoundary(e.frame, lastToward, e.point) : e.point;

  if (c.route === "elbow" && via.length === 0) {
    const midX = (start.x + end.x) / 2;
    return polyline([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
  }
  if (c.route === "curved" && via.length === 0) {
    // Quadratic curve with the control point offset from the middle, flattened to 24 segments.
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const nx = -(end.y - start.y) * 0.2;
    const ny = (end.x - start.x) * 0.2;
    const cp = { x: mx + nx, y: my + ny };
    const pts: Point[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const u = 1 - t;
      pts.push({ x: u * u * start.x + 2 * u * t * cp.x + t * t * end.x, y: u * u * start.y + 2 * u * t * cp.y + t * t * end.y });
    }
    return polyline(pts);
  }
  return polyline([start, ...via, end]);
}

/**
 * The boundary point of a box for a line that starts at `from` (which can be
 * off the box center because of a side offset) and goes toward `toward`.
 */
function offsetBoundary(f: ElementFrame, toward: Point, from: Point): Point {
  const b = frameBox(f);
  if (from.x === b.cx && from.y === b.cy) return boundaryPoint(f, toward);
  // Move the center by the offset, find the boundary, and keep the offset.
  const shifted = { ...f, offsetX: f.offsetX + (from.x - b.cx), offsetY: f.offsetY + (from.y - b.cy) };
  // `toward` is already the shifted point of the other end, so it is used as it is.
  return boundaryPoint(shifted, toward);
}

const PARALLEL_GAP = 44;

/** Connector routes for all connectors in a frame, keyed by connector ID. */
export function connectorRoutes(connectors: ConnectorElement[], frames: ElementFrame[]): Map<string, Polyline> {
  const map = new Map(frames.map((f) => [f.id, f]));
  // A group has no box of its own. An arrow to a group uses the union of the boxes in the group.
  const children = new Map<string, ElementFrame[]>();
  for (const f of frames) {
    if (f.parentId === undefined) continue;
    const list = children.get(f.parentId) ?? [];
    list.push(f);
    children.set(f.parentId, list);
  }
  const groupBox = (id: string, depth = 0): { x: number; y: number; r: number; b: number } | undefined => {
    let box: { x: number; y: number; r: number; b: number } | undefined;
    // Use the visible elements, so the arrow follows the group as elements enter and exit.
    const all = children.get(id) ?? [];
    const shown = all.filter((c) => c.visible);
    for (const c of shown.length > 0 ? shown : all) {
      if (c.type === "connector") continue;
      const cb = c.type === "group" ? (depth < 20 ? groupBox(c.id, depth + 1) : undefined) : (() => {
        const fb = frameBox(c);
        return { x: fb.x, y: fb.y, r: fb.x + fb.width, b: fb.y + fb.height };
      })();
      if (!cb) continue;
      box = box ? { x: Math.min(box.x, cb.x), y: Math.min(box.y, cb.y), r: Math.max(box.r, cb.r), b: Math.max(box.b, cb.b) } : cb;
    }
    return box;
  };
  for (const f of frames) {
    if (f.type !== "group") continue;
    const gb = groupBox(f.id);
    if (gb) map.set(f.id, { ...f, x: gb.x, y: gb.y, width: gb.r - gb.x, height: gb.b - gb.y, scale: 1, offsetX: 0, offsetY: 0, rotation: 0 });
  }
  // Group straight connectors that join the same two elements, in either direction.
  const groups = new Map<string, ConnectorElement[]>();
  for (const c of connectors) {
    if (c.start.kind !== "bound" || c.end.kind !== "bound" || c.waypoints?.length || c.route !== "straight") continue;
    const key = [c.start.elementId, c.end.elementId].sort().join("|");
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  const offsets = new Map<string, number>();
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const first = key.split("|")[0];
    list.forEach((c, i) => {
      // The sign keeps the offset on the same side for both directions.
      const forward = c.start.kind === "bound" && c.start.elementId === first ? 1 : -1;
      offsets.set(c.id, (i - (list.length - 1) / 2) * PARALLEL_GAP * forward);
    });
  }
  const out = new Map<string, Polyline>();
  for (const c of connectors) out.set(c.id, connectorRoute(c, map, offsets.get(c.id) ?? 0));
  return out;
}

/**
 * Evaluate a frame with exact connector lengths. Pass 1 evaluates the element
 * state. Pass 2 evaluates again with the connector lengths of that state, so
 * flow particles stop at the connector end and chained particles wait for the
 * travel time on their source connector.
 */
export function evaluateWithLayout(
  scene: Scene,
  timeMs: number,
): { frame: FrameState; routes: Map<string, Polyline> } {
  const connectors = Object.values(scene.elements).filter((e): e is ConnectorElement => e.type === "connector");
  const first = evaluate(scene, timeMs);
  const routes = connectorRoutes(connectors, first.elements);
  if (first.particles.length === 0) return { frame: first, routes };
  const frame = evaluate(scene, timeMs, { connectorLength: (id) => routes.get(id)?.length });
  return { frame, routes };
}
