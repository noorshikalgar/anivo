/**
 * The motion path of an element (docs/18 T3): the centers of the element at
 * its position keys, and the paths of its sends and moves. The canvas draws
 * them for the selected element; the user drags a key dot to change the key.
 */
import { type Timeline, evaluate } from "@anivo/engine";
import { keyframesIn } from "@anivo/ops";
import type { Point, Scene } from "@anivo/schema";
import { ELEMENT_KEY } from "./keys.js";

export interface PathKey {
  point: Point;
  stepId: string;
  actionId: string;
  atMs: number;
  /** The element size at the key, to turn a center into x and y. */
  width: number;
  height: number;
}

export interface MotionPath {
  /** The center before the first key, then a center for each position key. */
  start?: Point;
  keys: PathKey[];
  /** The paths of motion actions (sends and moves), as centers. */
  moves: Point[][];
  /** Drawn paths (moves, not sends): their points can be dragged (docs/24 H2). */
  paths: { stepId: string; actionId: string; points: Point[] }[];
}

const centerAt = (scene: Scene, id: string, t: number) => {
  const f = evaluate(scene, t).elements.find((e) => e.id === id);
  return f ? { point: { x: f.x + f.width / 2, y: f.y + f.height / 2 }, width: f.width, height: f.height } : undefined;
};

export function motionPath(scene: Scene, timeline: Timeline, id: string): MotionPath {
  const keys: PathKey[] = [];
  let first: { fromAtMs: number } | undefined;
  for (const ts of timeline.steps) {
    for (const k of keyframesIn(scene, ts.id)) {
      if (k.element !== id || k.group !== "position") continue;
      const atMs = ts.startMs + k.timeMs;
      const c = centerAt(scene, id, atMs);
      if (!c) continue;
      if (!first) first = { fromAtMs: ts.startMs + k.fromMs };
      keys.push({ point: c.point, width: c.width, height: c.height, stepId: ts.id, actionId: k.actionId, atMs });
    }
  }
  // Element position keys (docs/32): on the video time.
  const ek = scene.elements[id]?.keys;
  if (ek?.x || ek?.y) {
    const times = [...new Set([...(ek.x ?? []), ...(ek.y ?? [])].map((k) => k.t))];
    for (const t of times) {
      const c = centerAt(scene, id, t);
      if (c) keys.push({ point: c.point, width: c.width, height: c.height, stepId: ELEMENT_KEY, actionId: `ek|${id}|position|${t}`, atMs: t });
    }
  }
  keys.sort((a, b) => a.atMs - b.atMs);
  const start = first ? centerAt(scene, id, first.fromAtMs - 1)?.point : undefined;
  const moves: Point[][] = [];
  const paths: MotionPath["paths"] = [];
  for (const step of scene.steps)
    for (const a of step.actions) {
      if (a.type !== "motion" || !a.targets.includes(id)) continue;
      moves.push(a.motion.points);
      if (!a.motion.along) paths.push({ stepId: step.id, actionId: a.id, points: a.motion.points });
    }
  return { ...(start ? { start } : {}), keys, moves, paths };
}

/** The global times of all keys of an element (any property), for the onion skin. */
export function keyTimesOf(scene: Scene, timeline: Timeline, id: string): number[] {
  const out: number[] = [];
  for (const ts of timeline.steps) for (const k of keyframesIn(scene, ts.id)) if (k.element === id) out.push(ts.startMs + k.timeMs);
  return out;
}
