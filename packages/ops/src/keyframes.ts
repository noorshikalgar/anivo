/**
 * Keyframes (docs/16 section 2). A keyframe is the end of a morph action on
 * one element: the morph tweens a property group from the value before it to
 * the keyframe value. The data model does not change; these functions read
 * keyframes from the actions and make the operations that change them.
 */
import { type Action, type Scene, defaultDurationMs } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

/** Properties that animate together. */
export const KEY_GROUPS: Record<string, string[]> = {
  position: ["x", "y"],
  size: ["width", "height"],
  opacity: ["opacity"],
  rotation: ["rotation"],
  fill: ["fill"],
  stroke: ["stroke"],
  strokeWidth: ["strokeWidth"],
  textColor: ["textColor"],
  fontSize: ["fontSize"],
  cornerRadius: ["cornerRadius"],
  label: ["label"],
  shape: ["shape"],
};

export function groupOf(prop: string): string {
  for (const [g, keys] of Object.entries(KEY_GROUPS)) if (keys.includes(prop)) return g;
  return prop;
}

export interface Keyframe {
  stepId: string;
  actionId: string;
  element: string;
  group: string;
  /** Time of the keyframe from the start of the step. */
  timeMs: number;
  /** Start of the tween to this keyframe, from the start of the step. */
  fromMs: number;
  values: Record<string, unknown>;
}

type Morph = Extract<Action, { type: "morph" }>;
const isKeyMorph = (a: Action, element?: string): a is Morph => a.type === "morph" && a.targets.length === 1 && (element === undefined || a.targets[0] === element);
const endOf = (a: Morph) => a.delayMs + (a.durationMs ?? defaultDurationMs(a));

/** The keyframes of a step: one for each property group of each one-element morph. */
export function keyframesIn(scene: Scene, stepId: string): Keyframe[] {
  const step = scene.steps.find((s) => s.id === stepId);
  if (!step) return [];
  const out: Keyframe[] = [];
  for (const a of step.actions) {
    if (!isKeyMorph(a)) continue;
    const groups = new Map<string, Record<string, unknown>>();
    for (const [k, v] of Object.entries(a.to)) {
      const g = groupOf(k);
      groups.set(g, { ...(groups.get(g) ?? {}), [k]: v });
    }
    for (const [group, values] of groups) out.push({ stepId, actionId: a.id, element: a.targets[0]!, group, timeMs: endOf(a), fromMs: a.delayMs, values });
  }
  return out.sort((x, y) => x.timeMs - y.timeMs);
}

const MIN_MS = 50;
const SAME_MS = 20;

/**
 * Set property values of an element at a time of a step (auto-key). A keyframe
 * of the same group at that time changes. Else a new morph starts at the
 * keyframe before (or at the step start), and the keyframe after it starts at
 * the new time.
 */
export function setKeyframeOps(scene: Scene, stepId: string, element: string, values: Record<string, unknown>, timeMs: number): OperationInput[] {
  const step = scene.steps.find((s) => s.id === stepId);
  if (!step) return [];
  const t = Math.max(MIN_MS, Math.round(timeMs));
  const groups = new Set(Object.keys(values).map(groupOf));
  const morphs = step.actions.filter((a): a is Morph => isKeyMorph(a, element) && Object.keys(a.to).some((k) => groups.has(groupOf(k))));
  const same = morphs.find((a) => Math.abs(endOf(a) - t) <= SAME_MS);
  if (same) return [{ op: "action.update", step: stepId, id: same.id, set: { to: { ...same.to, ...values } } }];
  const before = morphs.filter((a) => endOf(a) < t).reduce((m, a) => Math.max(m, endOf(a)), 0);
  const ops: OperationInput[] = [{ op: "action.add", step: stepId, action: { type: "morph", targets: [element], to: values, delayMs: before, durationMs: Math.max(MIN_MS, t - before), easing: "ease-in-out" } }];
  // A later keyframe that tweened over this time now starts at the new keyframe.
  for (const a of morphs) {
    const end = endOf(a);
    if (end > t && a.delayMs < t) ops.push({ op: "action.update", step: stepId, id: a.id, set: { delayMs: t, durationMs: Math.max(MIN_MS, end - t) } });
  }
  return ops;
}

/** Move a keyframe to another time of its step. The keyframe after it starts at the new time. */
export function moveKeyframeOps(scene: Scene, stepId: string, actionId: string, timeMs: number): OperationInput[] {
  const step = scene.steps.find((s) => s.id === stepId);
  const a = step?.actions.find((x) => x.id === actionId);
  if (!step || !a || !isKeyMorph(a)) return [];
  const oldEnd = endOf(a);
  const groups = new Set(Object.keys(a.to).map(groupOf));
  const next = step.actions.filter((x): x is Morph => isKeyMorph(x, a.targets[0]) && x.id !== a.id && Object.keys(x.to).some((k) => groups.has(groupOf(k))) && Math.abs(x.delayMs - oldEnd) <= SAME_MS);
  let t = Math.max(a.delayMs + MIN_MS, Math.round(timeMs));
  for (const n of next) t = Math.min(t, endOf(n) - MIN_MS);
  const ops: OperationInput[] = [{ op: "action.update", step: stepId, id: a.id, set: { durationMs: t - a.delayMs } }];
  for (const n of next) ops.push({ op: "action.update", step: stepId, id: n.id, set: { delayMs: t, durationMs: endOf(n) - t } });
  return ops;
}

/** Delete a keyframe. The keyframe after it starts where the deleted one started. */
export function deleteKeyframeOps(scene: Scene, stepId: string, actionId: string): OperationInput[] {
  const step = scene.steps.find((s) => s.id === stepId);
  const a = step?.actions.find((x) => x.id === actionId);
  if (!step || !a || !isKeyMorph(a)) return [];
  const oldEnd = endOf(a);
  const groups = new Set(Object.keys(a.to).map(groupOf));
  const ops: OperationInput[] = [{ op: "action.remove", step: stepId, id: actionId }];
  for (const n of step.actions) {
    if (n.id === a.id || !isKeyMorph(n, a.targets[0]) || !Object.keys(n.to).some((k) => groups.has(groupOf(k))) || Math.abs(n.delayMs - oldEnd) > SAME_MS) continue;
    ops.push({ op: "action.update", step: stepId, id: n.id, set: { delayMs: a.delayMs, durationMs: endOf(n) - a.delayMs } });
  }
  return ops;
}

/**
 * Has the element keys (morphs) for any of these properties, in any step?
 * Like a stopwatch that is on in a video editor: then a change at the
 * playhead makes a key, else the change is static (docs/18).
 */
export function hasKeys(scene: Scene, element: string, props: string[]): boolean {
  const groups = new Set(props.map(groupOf));
  return scene.steps.some((s) => s.actions.some((a) => a.type === "morph" && a.targets.includes(element) && Object.keys(a.to).some((k) => groups.has(groupOf(k)))));
}
