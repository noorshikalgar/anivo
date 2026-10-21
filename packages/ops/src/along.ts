/** Send elements along a connector (docs/17 P2). */
import { alongPoints, staleAlong } from "@anivo/layout";
import type { Scene } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

export interface SendOptions {
  reverse?: boolean;
  /** Default 1600 ms: slow enough to follow. */
  durationMs?: number;
  delayMs?: number;
}

/** A motion action that moves the targets along the connector route. Empty if the connector has no route. */
export function sendAlongOps(scene: Scene, stepId: string, targets: string[], connectorId: string, o: SendOptions = {}): OperationInput[] {
  const points = alongPoints(scene, stepId, connectorId, o.reverse ?? false);
  if (!points || targets.length === 0) return [];
  return [
    {
      op: "action.add",
      step: stepId,
      action: { type: "motion", targets, durationMs: o.durationMs ?? 1600, delayMs: o.delayMs ?? 0, easing: "ease-in-out", motion: { points, along: connectorId, reverse: o.reverse ?? false } },
    },
  ];
}

/** Operations that set the points of each motion along a connector to the connector route now. */
export function syncAlongOps(scene: Scene): OperationInput[] {
  return staleAlong(scene).map((s) => ({ op: "action.update", step: s.stepId, id: s.actionId, set: { motion: { ...motionOf(scene, s.stepId, s.actionId), points: s.points } } }) as OperationInput);
}

function motionOf(scene: Scene, stepId: string, actionId: string): Record<string, unknown> {
  const a = scene.steps.find((s) => s.id === stepId)?.actions.find((x) => x.id === actionId);
  return a?.type === "motion" ? { ...a.motion } : {};
}
