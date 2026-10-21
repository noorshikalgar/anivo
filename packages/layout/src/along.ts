/**
 * Motion along a connector (docs/17 P2). The engine moves an element along
 * points. These functions get the points from the connector route at the
 * start of the step, so the engine stays pure and does not need routes.
 */
import { resolveTimeline } from "@anivo/engine";
import type { Point, Scene } from "@anivo/schema";
import { evaluateWithLayout } from "./geometry.js";

const round = (p: Point) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

/**
 * The route of a connector at the start of a step, as motion points.
 * With a target: the path starts at the target center just before the motion
 * starts (a lead-in), so the target does not jump onto the arrow.
 * Undefined if there is no route.
 */
export function alongPoints(scene: Scene, stepId: string, connectorId: string, reverse = false, target?: { id: string; delayMs: number }): Point[] | undefined {
  const ts = resolveTimeline(scene).steps.find((s) => s.id === stepId);
  if (!ts || scene.elements[connectorId]?.type !== "connector") return undefined;
  const route = evaluateWithLayout(scene, ts.startMs).routes.get(connectorId);
  if (!route || route.points.length < 2) return undefined;
  const pts = route.points.map(round);
  if (reverse) pts.reverse();
  if (target) {
    // Just before the motion starts, so this motion does not change the result.
    const f = evaluateWithLayout(scene, ts.startMs + target.delayMs - 1).frame.elements.find((e) => e.id === target.id);
    if (f) {
      const c = round({ x: f.x + f.width / 2, y: f.y + f.height / 2 });
      if (Math.hypot(c.x - pts[0]!.x, c.y - pts[0]!.y) > 4) pts.unshift(c);
      // Stop before the element at the end touches it: the target arrives next to it, not on it.
      const a = pts[pts.length - 2]!;
      const b = pts[pts.length - 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 0) {
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const back = Math.min(len * 0.8, Math.abs(ux) * (f.width / 2) + Math.abs(uy) * (f.height / 2) + 6);
        pts[pts.length - 1] = round({ x: b.x - ux * back, y: b.y - uy * back });
      }
    }
  }
  return pts;
}

/** Motion actions with `along` whose points are not the connector route now. */
export function staleAlong(scene: Scene): { stepId: string; actionId: string; points: Point[] }[] {
  const out: { stepId: string; actionId: string; points: Point[] }[] = [];
  for (const step of scene.steps) {
    for (const a of step.actions) {
      if (a.type !== "motion" || !a.motion.along) continue;
      const pts = alongPoints(scene, step.id, a.motion.along, a.motion.reverse, a.targets.length === 1 ? { id: a.targets[0]!, delayMs: a.delayMs } : undefined);
      if (!pts) continue;
      const same = pts.length === a.motion.points.length && pts.every((p, i) => Math.hypot(p.x - a.motion.points[i]!.x, p.y - a.motion.points[i]!.y) < 1);
      if (!same) out.push({ stepId: step.id, actionId: a.id, points: pts });
    }
  }
  return out;
}
