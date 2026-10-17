import { type Polyline, polyline } from "@anivo/layout";
import type { Point } from "@anivo/schema";
// Import the bundled build. The files in roughjs/bin use import paths that Node ESM cannot resolve.
import rough from "roughjs";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OutlineKind = "rectangle" | "ellipse" | "diamond" | "line";

const outlineCache = new Map<string, Polyline>();

/** Closed outline of a shape as one polyline (clean style). Cached by shape, size, and position. */
export function cleanOutline(kind: OutlineKind, b: Box, radius: number): Polyline {
  const key = `${kind}|${b.x}|${b.y}|${b.width}|${b.height}|${radius}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const line = cleanOutlineUncached(kind, b, radius);
  if (outlineCache.size > 5000) outlineCache.clear();
  outlineCache.set(key, line);
  return line;
}

function cleanOutlineUncached(kind: OutlineKind, b: Box, radius: number): Polyline {
  const pts: Point[] = [];
  if (kind === "ellipse") {
    const n = 72;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // Start at the top, clockwise, like a pen on paper.
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      pts.push({ x: cx + (Math.cos(a) * b.width) / 2, y: cy + (Math.sin(a) * b.height) / 2 });
    }
  } else if (kind === "diamond") {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    pts.push({ x: cx, y: b.y }, { x: b.x + b.width, y: cy }, { x: cx, y: b.y + b.height }, { x: b.x, y: cy }, { x: cx, y: b.y });
  } else if (kind === "line") {
    pts.push({ x: b.x, y: b.y + b.height / 2 }, { x: b.x + b.width, y: b.y + b.height / 2 });
  } else {
    const r = Math.max(0, Math.min(radius, b.width / 2, b.height / 2));
    const seg = 8;
    const corner = (cx: number, cy: number, start: number) => {
      for (let i = 0; i <= seg; i++) {
        const a = start + (i / seg) * (Math.PI / 2);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
    };
    const { x, y, width: w, height: h } = b;
    pts.push({ x: x + r, y });
    corner(x + w - r, y + r, -Math.PI / 2);
    corner(x + w - r, y + h - r, 0);
    corner(x + r, y + h - r, Math.PI / 2);
    corner(x + r, y + r, Math.PI);
    pts.push({ x: x + r, y });
  }
  return polyline(pts);
}

const generator = rough.generator();

/** Sampled cubic Bézier, without the start point. */
function sampleBezier(p0: Point, p1: Point, p2: Point, p3: Point, n: number, out: Point[]): void {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
}

/** Sketch outline: the Rough.js stroke paths, flattened and joined in sequence. */
export interface SketchOutline {
  /** Stroke strokes, each one a polyline. Drawn in sequence for draw-on. */
  strokes: Polyline[];
  totalLength: number;
}

const cache = new Map<string, SketchOutline>();
const CACHE_MAX = 2000;

function flattenOps(ops: { op: string; data: number[] }[]): Polyline[] {
  const lines: Polyline[] = [];
  let cur: Point[] = [];
  let last: Point = { x: 0, y: 0 };
  for (const { op, data } of ops) {
    if (op === "move") {
      if (cur.length > 1) lines.push(polyline(cur));
      last = { x: data[0]!, y: data[1]! };
      cur = [last];
    } else if (op === "lineTo") {
      last = { x: data[0]!, y: data[1]! };
      cur.push(last);
    } else if (op === "bcurveTo") {
      const p3 = { x: data[4]!, y: data[5]! };
      sampleBezier(last, { x: data[0]!, y: data[1]! }, { x: data[2]!, y: data[3]! }, p3, 6, cur);
      last = p3;
    }
  }
  if (cur.length > 1) lines.push(polyline(cur));
  return lines;
}

/**
 * Rough.js stroke for a polyline or a shape, flattened. Cached by shape and
 * seed, so the same element gives the same lines in each frame (FR-STYLE-01).
 */
export function sketchOutline(key: string, source: { kind: OutlineKind; box: Box } | { points: Point[] }, seed: number, roughness: number, strokeWidth: number): SketchOutline {
  const cacheKey = `${key}|${seed}|${roughness}|${strokeWidth}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const opts = { seed: Math.max(1, seed), roughness, strokeWidth, bowing: 1, disableMultiStroke: false, preserveVertices: true };
  let drawable;
  if ("points" in source) {
    drawable = generator.linearPath(source.points.map((p) => [p.x, p.y] as [number, number]), opts);
  } else {
    const { kind, box: b } = source;
    if (kind === "ellipse") drawable = generator.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height, opts);
    else if (kind === "diamond") {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      drawable = generator.polygon([[cx, b.y], [b.x + b.width, cy], [cx, b.y + b.height], [b.x, cy]], opts);
    } else if (kind === "line") drawable = generator.line(b.x, b.y + b.height / 2, b.x + b.width, b.y + b.height / 2, opts);
    else drawable = generator.rectangle(b.x, b.y, b.width, b.height, opts);
  }
  const strokes: Polyline[] = [];
  for (const set of drawable.sets) if (set.type === "path") strokes.push(...flattenOps(set.ops));
  const out = { strokes, totalLength: strokes.reduce((s, l) => s + l.length, 0) };
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(cacheKey, out);
  return out;
}
