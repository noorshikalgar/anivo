/**
 * Motion along a connector (docs/17 P2). The engine moves an element along
 * points. These functions get the points from the connector route at the
 * start of the step, so the engine stays pure and does not need routes.
 */
import { resolveTimeline } from "@anivo/engine";
import type { Point, Scene } from "@anivo/schema";
import { evaluateWithLayout } from "./geometry.js";

/** The route of a connector at the start of a step, as motion points. Undefined if there is no route. */
export function alongPoints(scene: Scene, stepId: string, connectorId: string, reverse = false): Point[] | undefined {
  const ts = resolveTimeline(scene).steps.find((s) => s.id === stepId);
  if (!ts || scene.elements[connectorId]?.type !== "connector") return undefined;
  const route = evaluateWithLayout(scene, ts.startMs).routes.get(connectorId);
  if (!route || route.points.length < 2) return undefined;
  const pts = route.points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  return reverse ? pts.reverse() : pts;
}

/** Motion actions with `along` whose points are not the connector route now. */
export function staleAlong(scene: Scene): { stepId: string; actionId: string; points: Point[] }[] {
  const out: { stepId: string; actionId: string; points: Point[] }[] = [];
  for (const step of scene.steps) {
    for (const a of step.actions) {
      if (a.type !== "motion" || !a.motion.along) continue;
      const pts = alongPoints(scene, step.id, a.motion.along, a.motion.reverse);
      if (!pts) continue;
      const same = pts.length === a.motion.points.length && pts.every((p, i) => Math.hypot(p.x - a.motion.points[i]!.x, p.y - a.motion.points[i]!.y) < 1);
      if (!same) out.push({ stepId: step.id, actionId: a.id, points: pts });
    }
  }
  return out;
}
