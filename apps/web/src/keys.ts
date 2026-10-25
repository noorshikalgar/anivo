/**
 * Keys in the editor (docs/32). The timeline shows two kinds of keys with one
 * look: element keys (on the video time, the new model) and step keys (older
 * scenes: one-element morphs in a step). These functions hide the difference.
 */
import { ELEMENT_KEY_GROUPS, type Keyframe, type OperationInput, deleteElementKeysAtOps, deleteKeyframeOps, easeElementKeysAtOps, elementKeyDiamonds, moveKeyframeOps, shiftElementKeysOps } from "@anivo/ops";
import type { Easing, KeyProp, Scene } from "@anivo/schema";

/** The step ID of an element key: element keys are not in a step. */
export const ELEMENT_KEY = "@element";

export interface AnyKey extends Keyframe {
  atMs: number;
  fromAtMs: number;
}

/** Properties that element keys can animate. */
export const KEY_PROPS = new Set<string>(Object.values(ELEMENT_KEY_GROUPS).flat());

export const isElementKey = (k: { stepId: string }) => k.stepId === ELEMENT_KEY;

/** The element keys of a scene, as timeline keys. */
export function elementTimelineKeys(scene: Scene): AnyKey[] {
  return elementKeyDiamonds(scene).map((d) => ({
    stepId: ELEMENT_KEY,
    actionId: `ek|${d.element}|${d.group}|${d.t}`,
    element: d.element,
    group: d.group,
    timeMs: d.t,
    fromMs: d.prevT,
    values: d.values,
    atMs: d.t,
    fromAtMs: d.prevT,
  }));
}

const propsOf = (k: AnyKey | Keyframe) => ELEMENT_KEY_GROUPS[k.group] ?? [k.group as KeyProp];

/** Move a key to time t: video time for an element key, step time for a step key. */
export function moveKeyOps(scene: Scene, k: Keyframe, t: number): OperationInput[] {
  if (!isElementKey(k)) return moveKeyframeOps(scene, k.stepId, k.actionId, t);
  return shiftElementKeysOps(scene, k.element, propsOf(k).map((prop) => ({ prop, t: k.timeMs })), Math.max(0, t) - k.timeMs);
}

export function deleteKeyOps(scene: Scene, k: Keyframe): OperationInput[] {
  return isElementKey(k) ? deleteElementKeysAtOps(scene, k.element, propsOf(k), k.timeMs) : deleteKeyframeOps(scene, k.stepId, k.actionId);
}

export function easeKeyOps(k: Keyframe, scene: Scene, ease: Easing): OperationInput[] {
  return isElementKey(k) ? easeElementKeysAtOps(scene, k.element, propsOf(k), k.timeMs, ease) : [{ op: "action.update", step: k.stepId, id: k.actionId, set: { easing: ease } }];
}

/** The ease of a key (the move from it to the next key, or for a step key, into it). */
export function easeOfKey(scene: Scene, k: Keyframe): Easing {
  if (isElementKey(k)) {
    const list = scene.elements[k.element]?.keys?.[propsOf(k)[0]!];
    return list?.find((x) => Math.abs(x.t - k.timeMs) <= 20)?.ease ?? "ease-in-out";
  }
  const a = scene.steps.find((s) => s.id === k.stepId)?.actions.find((x) => x.id === k.actionId);
  return (a && "easing" in a && a.easing) || "ease-in-out";
}
