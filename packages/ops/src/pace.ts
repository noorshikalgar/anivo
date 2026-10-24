/**
 * Pace (docs/28 P1): make the whole video slower or faster in one change.
 * Every delay, duration, stagger, hold, and transition time is multiplied by
 * the factor; flow particles move slower or faster by the same amount. Cues
 * (times in a voiceover) do not change.
 */
import { type Scene, defaultDurationMs } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

export function paceOps(scene: Scene, factor: number, stepIds?: string[]): OperationInput[] {
  if (!(factor > 0)) return [];
  const k = (ms: number) => Math.max(0, Math.round(ms * factor));
  const textLength = (id: string): number => {
    const el = scene.elements[id];
    if (!el) return 0;
    if (el.type === "text") return el.content.text.length;
    return "label" in el && el.label ? el.label.text.length : 0;
  };
  const ops: OperationInput[] = [];
  for (const step of scene.steps) {
    if (stepIds && !stepIds.includes(step.id)) continue;
    const set: Record<string, unknown> = { holdMs: k(step.holdMs) };
    if (step.durationMs !== undefined) set["durationMs"] = k(step.durationMs);
    if (step.transition) set["transition"] = { ...step.transition, durationMs: k(step.transition.durationMs) };
    ops.push({ op: "step.update", id: step.id, set });
    for (const a of step.actions) {
      const longest = Math.max(0, ...a.targets.map((t) => defaultDurationMs(a, textLength(t))));
      const aset: Record<string, unknown> = { delayMs: k(a.delayMs), durationMs: Math.max(1, k(a.durationMs ?? longest)) };
      if (a.staggerMs) aset["staggerMs"] = k(a.staggerMs);
      if (a.type === "flow") aset["flow"] = { ...a.flow, speed: a.flow.speed / factor, rate: a.flow.rate / factor };
      ops.push({ op: "action.update", step: step.id, id: a.id, set: aset });
    }
  }
  return ops;
}
