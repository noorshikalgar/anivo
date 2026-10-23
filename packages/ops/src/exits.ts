/**
 * Exit for every enter (docs/21 C8): the same effect, reversed, in one step.
 * "after": in the same step, when the enter and the other actions end.
 * "next-step": at the start of the next step (the elements leave when the
 * next idea comes). The last step has no next step: then "after".
 */
import { type Action, type Scene, defaultDurationMs } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

export type ExitPlace = "after" | "next-step";

export function exitForOps(scene: Scene, stepId: string, actionId: string, place: ExitPlace = "after"): OperationInput[] | { error: string } {
  const index = scene.steps.findIndex((s) => s.id === stepId);
  const step = scene.steps[index];
  const enter = step?.actions.find((a) => a.id === actionId);
  if (!step || !enter) return { error: "Select an enter action first." };
  if (enter.type !== "enter") return { error: "Only an enter action has a matching exit." };
  const { id: _id, type: _type, delayMs: _d, sound: _s, ...rest } = enter as Action & Record<string, unknown>;
  void _id, _type, _d, _s;
  const exit: Record<string, unknown> = { ...rest, type: "exit" };
  // An exit has no sound.
  const next = scene.steps[index + 1];
  if (place === "next-step" && next) return [{ op: "action.add", step: next.id, index: 0, action: { ...exit, delayMs: 0 } }];
  // The end of the step content, without the timeline (stagger and default durations).
  let end = 0;
  for (const a of step.actions) end = Math.max(end, a.delayMs + Math.max(0, a.targets.length - 1) * a.staggerMs + (a.durationMs ?? defaultDurationMs(a)));
  return [{ op: "action.add", step: step.id, action: { ...exit, delayMs: end } }];
}
