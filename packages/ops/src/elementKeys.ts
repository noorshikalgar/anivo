/**
 * Element keyframes (docs/32): set, move, ease, and delete the keys of an
 * element. Keys are on the video time; a property with keys takes its value
 * from them. Each change is one element.update of the element keys.
 */
import type { Easing, ElementKeys, KeyProp, Keyframe, Scene } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

/** Two keys closer than this are the same key. */
const SAME_MS = 20;

type Value = number | string;

const sorted = (keys: Keyframe[]) => [...keys].sort((a, b) => a.t - b.t);

function update(id: string, keys: ElementKeys): OperationInput {
  const clean = Object.fromEntries(Object.entries(keys).filter(([, v]) => v && v.length > 0));
  return { op: "element.update", id, set: { keys: Object.keys(clean).length ? clean : null } };
}

/**
 * Keys for the values at time t. A key at the same time changes. The first
 * key of a property at a time after 0 also gets a key at `baseT` (the start of
 * the step in the editor, else 0) with the value before the change (`base`),
 * so the element changes from how it was, and does not drift over the video.
 */
export function setElementKeysOps(scene: Scene, id: string, values: Partial<Record<KeyProp, Value>>, t: number, base: Partial<Record<KeyProp, Value>> = {}, baseT = 0): OperationInput[] {
  const el = scene.elements[id];
  if (!el) return [];
  const time = Math.max(0, Math.round(t));
  const keys: ElementKeys = { ...(el.keys ?? {}) };
  for (const [prop, v] of Object.entries(values) as [KeyProp, Value][]) {
    const list = [...(keys[prop] ?? [])];
    const same = list.findIndex((k) => Math.abs(k.t - time) <= SAME_MS);
    if (same >= 0) list[same] = { ...list[same]!, v };
    else {
      const from = Math.max(0, Math.min(time - SAME_MS - 1, Math.round(baseT)));
      if (list.length === 0 && time > SAME_MS && base[prop] !== undefined && base[prop] !== v) list.push({ t: from, v: base[prop]! });
      list.push({ t: time, v });
    }
    keys[prop] = sorted(list);
  }
  return [update(id, keys)];
}

/** Move one key to time t (0 or later). A key that lands on another key replaces it. */
export function moveElementKeyOps(scene: Scene, id: string, prop: KeyProp, fromT: number, t: number): OperationInput[] {
  const list = scene.elements[id]?.keys?.[prop];
  if (!list) return [];
  const i = list.findIndex((k) => Math.abs(k.t - fromT) <= SAME_MS);
  if (i < 0) return [];
  const time = Math.max(0, Math.round(t));
  const moved = { ...list[i]!, t: time };
  const rest = list.filter((k, j) => j !== i && Math.abs(k.t - time) > SAME_MS);
  return [update(id, { ...scene.elements[id]!.keys, [prop]: sorted([...rest, moved]) })];
}

/** Move many keys of an element by dt (all props): a box selection or a whole row. */
export function shiftElementKeysOps(scene: Scene, id: string, picks: { prop: KeyProp; t: number }[], dt: number): OperationInput[] {
  const el = scene.elements[id];
  if (!el?.keys) return [];
  const keys: ElementKeys = { ...el.keys };
  for (const prop of new Set(picks.map((p) => p.prop))) {
    const list = keys[prop] ?? [];
    const times = picks.filter((p) => p.prop === prop).map((p) => p.t);
    const isPicked = (k: Keyframe) => times.some((x) => Math.abs(x - k.t) <= SAME_MS);
    const moved = list.filter(isPicked).map((k) => ({ ...k, t: Math.max(0, Math.round(k.t + dt)) }));
    const rest = list.filter((k) => !isPicked(k) && !moved.some((m) => Math.abs(m.t - k.t) <= SAME_MS));
    keys[prop] = sorted([...rest, ...moved]);
  }
  return [update(id, keys)];
}

export function deleteElementKeyOps(scene: Scene, id: string, prop: KeyProp, t: number): OperationInput[] {
  const list = scene.elements[id]?.keys?.[prop];
  if (!list) return [];
  return [update(id, { ...scene.elements[id]!.keys, [prop]: list.filter((k) => Math.abs(k.t - t) > SAME_MS) })];
}

export function easeElementKeyOps(scene: Scene, id: string, prop: KeyProp, t: number, ease: Easing): OperationInput[] {
  const list = scene.elements[id]?.keys?.[prop];
  if (!list) return [];
  return [update(id, { ...scene.elements[id]!.keys, [prop]: list.map((k) => (Math.abs(k.t - t) <= SAME_MS ? { ...k, ease } : k)) })];
}

/** All keys of the scene, for the timeline: element, property, time, value. */
export function elementKeysOf(scene: Scene): { id: string; prop: KeyProp; key: Keyframe }[] {
  const out: { id: string; prop: KeyProp; key: Keyframe }[] = [];
  for (const el of Object.values(scene.elements)) for (const [prop, list] of Object.entries(el.keys ?? {}) as [KeyProp, Keyframe[]][]) for (const key of list) out.push({ id: el.id, prop, key });
  return out;
}

/** Delete the keys of several properties at one time (a diamond of a property group). */
export function deleteElementKeysAtOps(scene: Scene, id: string, props: KeyProp[], t: number): OperationInput[] {
  const el = scene.elements[id];
  if (!el?.keys) return [];
  const keys: ElementKeys = { ...el.keys };
  for (const p of props) keys[p] = (keys[p] ?? []).filter((k) => Math.abs(k.t - t) > SAME_MS);
  return [update(id, keys)];
}

/** Set the ease of the keys of several properties at one time. */
export function easeElementKeysAtOps(scene: Scene, id: string, props: KeyProp[], t: number, ease: Easing): OperationInput[] {
  const el = scene.elements[id];
  if (!el?.keys) return [];
  const keys: ElementKeys = { ...el.keys };
  for (const p of props) if (keys[p]) keys[p] = keys[p]!.map((k) => (Math.abs(k.t - t) <= SAME_MS ? { ...k, ease } : k));
  return [update(id, keys)];
}

/** The property groups of element keys, as the timeline and the property panel show them (one diamond for x and y). */
export const ELEMENT_KEY_GROUPS: Record<string, KeyProp[]> = {
  position: ["x", "y"],
  size: ["width", "height"],
  opacity: ["opacity"],
  rotation: ["rotation"],
  scale: ["scale"],
  fill: ["fill"],
  stroke: ["stroke"],
  strokeWidth: ["strokeWidth"],
  textColor: ["textColor"],
  fontSize: ["fontSize"],
  cornerRadius: ["cornerRadius"],
};

/** One diamond for each group and time: the timeline view of element keys. */
export function elementKeyDiamonds(scene: Scene): { element: string; group: string; t: number; values: Record<string, Value>; prevT: number; ease?: Easing }[] {
  const out: { element: string; group: string; t: number; values: Record<string, Value>; prevT: number; ease?: Easing }[] = [];
  for (const el of Object.values(scene.elements)) {
    if (!el.keys) continue;
    for (const [group, props] of Object.entries(ELEMENT_KEY_GROUPS)) {
      const at = new Map<number, Record<string, Value>>();
      const ease = new Map<number, Easing | undefined>();
      for (const p of props) for (const k of el.keys[p] ?? []) {
        at.set(k.t, { ...(at.get(k.t) ?? {}), [p]: k.v });
        if (!ease.has(k.t)) ease.set(k.t, k.ease);
      }
      const times = [...at.keys()].sort((a, b) => a - b);
      times.forEach((t, i) => out.push({ element: el.id, group, t, values: at.get(t)!, prevT: i > 0 ? times[i - 1]! : t, ...(ease.get(t) ? { ease: ease.get(t)! } : {}) }));
    }
  }
  return out;
}
