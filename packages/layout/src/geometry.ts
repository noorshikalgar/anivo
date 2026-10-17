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
export function connectorRoute(c: ConnectorElement, frames: Map<string, ElementFrame>): Polyline {
  const s = endAnchor(c.start, frames);
  const e = endAnchor(c.end, frames);
  const via = c.waypoints ?? [];
  const firstToward = via[0] ?? e.point;
  const lastToward = via[via.length - 1] ?? s.point;
  const start = s.frame ? boundaryPoint(s.frame, firstToward) : s.point;
  const end = e.frame ? boundaryPoint(e.frame, lastToward) : e.point;

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

/** Connector routes for all connectors in a frame, keyed by connector ID. */
export function connectorRoutes(connectors: ConnectorElement[], frames: ElementFrame[]): Map<string, Polyline> {
  const map = new Map(frames.map((f) => [f.id, f]));
  const out = new Map<string, Polyline>();
  for (const c of connectors) out.set(c.id, connectorRoute(c, map));
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
