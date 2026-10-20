import type { ElementFrame, FrameState } from "@anivo/engine";
import { type Polyline, connectorRoutes, frameBox, pointAt } from "@anivo/layout";
import type { OperationInput } from "@anivo/ops";
import type { ConnectorElement, Element, Point, Scene } from "@anivo/schema";
import type { View } from "./store.js";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const GRID = 8;
export const snap = (v: number, on: boolean, size = GRID) => (on ? Math.round(v / size) * size : v);

/** Scene point from a point in canvas CSS pixels. */
export function toScene(view: View, cx: number, cy: number): Point {
  return { x: view.x + cx / view.zoom, y: view.y + cy / view.zoom };
}

/** Canvas CSS pixel point from a scene point. */
export function toScreen(view: View, p: Point): Point {
  return { x: (p.x - view.x) * view.zoom, y: (p.y - view.y) * view.zoom };
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToPolyline(p: Point, line: Polyline): number {
  let d = Infinity;
  for (let i = 1; i < line.points.length; i++) d = Math.min(d, distToSegment(p, line.points[i - 1]!, line.points[i]!));
  return d;
}

/** Bounds of an element in a frame. Connectors use the bounds of their route. */
export function elementBounds(f: ElementFrame, routes: Map<string, Polyline>): Box {
  if (f.type === "connector") {
    const pts = routes.get(f.id)?.points ?? [];
    if (pts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  const b = frameBox(f);
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

/** Is the frame element drawn in the editor (visible, or a ghost while paused)? */
const shown = (f: ElementFrame, ghosts: boolean) => f.type !== "group" && (f.visible || ghosts);

/**
 * Elements that the canvas does not pick: hidden in the editor, and locked if `locked` is true.
 * A flag on a group or a table applies to its children.
 */
export function editorSkip(scene: Scene, locked: boolean): (id: string) => boolean {
  const cache = new Map<string, boolean>();
  const skip = (id: string): boolean => {
    const known = cache.get(id);
    if (known !== undefined) return known;
    const el = scene.elements[id];
    const v = !!el && (el.editorHidden || (locked && el.locked) || (el.parentId !== undefined && skip(el.parentId)));
    cache.set(id, v);
    return v;
  };
  return skip;
}

/** IDs of the elements that are hidden in the editor (with their children). */
export function editorHiddenIds(scene: Scene): Set<string> {
  const skip = editorSkip(scene, false);
  return new Set(Object.keys(scene.elements).filter(skip));
}

/** Top-most element at a scene point. `tolerance` is in scene pixels. */
export function hitTest(frame: FrameState, routes: Map<string, Polyline>, p: Point, tolerance: number, ghosts: boolean, skip?: (id: string) => boolean): string | null {
  for (let i = frame.elements.length - 1; i >= 0; i--) {
    const f = frame.elements[i]!;
    if (!shown(f, ghosts) || skip?.(f.id)) continue;
    if (f.type === "connector") {
      const route = routes.get(f.id);
      if (route && distToPolyline(p, route) <= tolerance + 4) return f.id;
      continue;
    }
    const b = elementBounds(f, routes);
    const pad = f.type === "icon" ? 44 : 0; // the icon label is below the icon
    if (p.x >= b.x - tolerance && p.x <= b.x + b.width + tolerance && p.y >= b.y - tolerance && p.y <= b.y + b.height + pad + tolerance) return f.id;
  }
  return null;
}

/** Elements fully inside a scene rectangle. */
export function elementsInRect(frame: FrameState, routes: Map<string, Polyline>, r: Box, ghosts: boolean, skip?: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (const f of frame.elements) {
    if (!shown(f, ghosts) || skip?.(f.id)) continue;
    const b = elementBounds(f, routes);
    if (b.x >= r.x && b.y >= r.y && b.x + b.width <= r.x + r.width && b.y + b.height <= r.y + r.height) out.push(f.id);
  }
  return out;
}

export function normalizeRect(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Positions of the resize handles of a box. */
export function handlePoints(b: Box): Record<Handle, Point> {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const r = b.x + b.width;
  const btm = b.y + b.height;
  return { nw: { x: b.x, y: b.y }, n: { x: cx, y: b.y }, ne: { x: r, y: b.y }, e: { x: r, y: cy }, se: { x: r, y: btm }, s: { x: cx, y: btm }, sw: { x: b.x, y: btm }, w: { x: b.x, y: cy } };
}

/** New box after a resize handle moves by (dx, dy). Minimum size 8. */
export function resizeBox(b: Box, h: Handle, dx: number, dy: number, keepRatio: boolean): Box {
  let { x, y, width, height } = b;
  if (h.includes("w")) {
    x += dx;
    width -= dx;
  }
  if (h.includes("e")) width += dx;
  if (h.includes("n")) {
    y += dy;
    height -= dy;
  }
  if (h.includes("s")) height += dy;
  if (keepRatio && b.width > 0 && b.height > 0 && h.length === 2) {
    const ratio = b.width / b.height;
    if (width / height > ratio) {
      const w = height * ratio;
      if (h.includes("w")) x += width - w;
      width = w;
    } else {
      const hh = width / ratio;
      if (h.includes("n")) y += height - hh;
      height = hh;
    }
  }
  if (width < 8) {
    if (h.includes("w")) x -= 8 - width;
    width = 8;
  }
  if (height < 8) {
    if (h.includes("n")) y -= 8 - height;
    height = 8;
  }
  return { x, y, width, height };
}

/** A frame with some elements moved or resized, for the live preview during a drag. */
export function previewFrame(scene: Scene, frame: FrameState, changes: Map<string, Partial<Box>>): { frame: FrameState; routes: Map<string, Polyline> } {
  const elements = frame.elements.map((f) => {
    const c = changes.get(f.id);
    return c ? { ...f, ...c } : f;
  });
  const next = { ...frame, elements };
  const connectors = Object.values(scene.elements).filter((e): e is ConnectorElement => e.type === "connector");
  return { frame: next, routes: connectorRoutes(connectors, elements) };
}

/**
 * Operations that apply a geometry change of elements in the editor.
 *
 * - In the base state (no step selected), change the element.
 * - In a step, if the element is not visible at the start of the step, it
 *   appears in this step or later: change the element (its base position).
 * - Else, record a morph in the step (docs/06 "Editor recording of a morph").
 *   Merge with a morph for the same element in that step, if one exists.
 */
export function geometryOps(
  scene: Scene,
  stepId: string | null,
  visibleAtStepStart: (id: string) => boolean,
  changes: Map<string, Box>,
  current: (id: string) => Box | undefined,
  /** Auto-key: the keyframe operations for a step change, or null to change the step morph. */
  keyframe?: (id: string, values: Record<string, number>) => OperationInput[] | null,
): OperationInput[] {
  const ops: OperationInput[] = [];
  const step = stepId === null ? undefined : scene.steps.find((s) => s.id === stepId);
  for (const [id, box] of changes) {
    const el: Element | undefined = scene.elements[id];
    if (!el || el.type === "connector") continue;
    const now = current(id);
    const set: Record<string, number> = {};
    for (const k of ["x", "y", "width", "height"] as const) {
      if (now === undefined || Math.abs(box[k] - now[k]) > 1e-6) set[k] = Math.round(box[k] * 100) / 100;
    }
    if (Object.keys(set).length === 0) continue;
    if (!step || !visibleAtStepStart(id)) {
      // Base change: apply the delta to the base geometry, so earlier morphs keep their offsets.
      const base: Record<string, number> = {};
      for (const k of Object.keys(set) as (keyof Box)[]) base[k] = Math.round((el[k] + (box[k] - (now?.[k] ?? el[k]))) * 100) / 100;
      ops.push({ op: "element.update", id, set: base });
      continue;
    }
    const keyed = keyframe?.(id, set);
    if (keyed) {
      ops.push(...keyed);
      continue;
    }
    const morph = step.actions.find((a) => a.type === "morph" && a.targets.length === 1 && a.targets[0] === id);
    if (morph && morph.type === "morph") ops.push({ op: "action.update", step: step.id, id: morph.id, set: { to: { ...morph.to, ...set } } });
    else ops.push({ op: "action.add", step: step.id, action: { type: "morph", targets: [id], to: set } });
  }
  return ops;
}

/** Point on a connector route at its middle, for labels and handles. */
export function routeMiddle(route: Polyline): Point {
  return pointAt(route, route.length / 2).point;
}

/** Descendants of a group that are not groups. */
export function leafDescendants(scene: Scene, id: string): string[] {
  const el = scene.elements[id];
  if (!el) return [];
  if (el.type !== "group" && el.type !== "table") return [id];
  const kids = Object.values(scene.elements)
    .filter((e) => e.parentId === id)
    .flatMap((e) => leafDescendants(scene, e.id));
  // A table moves and resizes with its cells.
  return el.type === "table" ? [id, ...kids] : kids;
}

/** The top-most group that contains the element, or the element itself. */
export function topLevel(scene: Scene, id: string): string {
  let cur = scene.elements[id];
  while (cur?.parentId && scene.elements[cur.parentId]) cur = scene.elements[cur.parentId];
  return cur?.id ?? id;
}

/** Bounds of an element in a frame. A group uses the union of its elements. */
export function boundsOf(scene: Scene, frame: FrameState, routes: Map<string, Polyline>, id: string): Box | undefined {
  const byId = new Map(frame.elements.map((f) => [f.id, f]));
  const ids = scene.elements[id]?.type === "group" ? leafDescendants(scene, id) : [id];
  let box: Box | undefined;
  for (const leaf of ids) {
    const f = byId.get(leaf);
    if (!f) continue;
    const b = elementBounds(f, routes);
    if (!box) box = b;
    else {
      const x = Math.min(box.x, b.x);
      const y = Math.min(box.y, b.y);
      box = { x, y, width: Math.max(box.x + box.width, b.x + b.width) - x, height: Math.max(box.y + box.height, b.y + b.height) - y };
    }
  }
  return box;
}

export interface GuideLine {
  axis: "x" | "y";
  /** Scene coordinate of the line. */
  at: number;
  from: number;
  to: number;
}

/**
 * Smart guides (FR-CANVAS-08): align the edges or centers of a moving box with
 * other boxes. Returns the change of the move on each axis (0 if no guide) and
 * the guide lines to draw.
 */
export function smartGuides(moving: Box, others: Box[], threshold: number): { dx: number | null; dy: number | null; lines: GuideLine[] } {
  const xs = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
  const ys = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];
  let best = { x: { d: Infinity, at: 0, other: null as Box | null }, y: { d: Infinity, at: 0, other: null as Box | null } };
  for (const o of others) {
    for (const a of xs(moving)) for (const b of xs(o)) if (Math.abs(b - a) < Math.abs(best.x.d) && Math.abs(b - a) <= threshold) best = { ...best, x: { d: b - a, at: b, other: o } };
    for (const a of ys(moving)) for (const b of ys(o)) if (Math.abs(b - a) < Math.abs(best.y.d) && Math.abs(b - a) <= threshold) best = { ...best, y: { d: b - a, at: b, other: o } };
  }
  const lines: GuideLine[] = [];
  const dx = best.x.other ? best.x.d : null;
  const dy = best.y.other ? best.y.d : null;
  const m = { ...moving, x: moving.x + (dx ?? 0), y: moving.y + (dy ?? 0) };
  if (best.x.other) lines.push({ axis: "x", at: best.x.at, from: Math.min(m.y, best.x.other.y) - 16, to: Math.max(m.y + m.height, best.x.other.y + best.x.other.height) + 16 });
  if (best.y.other) lines.push({ axis: "y", at: best.y.at, from: Math.min(m.x, best.y.other.x) - 16, to: Math.max(m.x + m.width, best.y.other.x + best.y.other.width) + 16 });
  return { dx, dy, lines };
}
