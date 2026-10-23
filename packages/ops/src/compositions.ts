/**
 * Compositions (docs/20 B6): elements together with their animations, saved
 * to use again in any scene. A composition keeps the elements (with their
 * groups and the arrows between them) and, for each step that animates them,
 * the actions, the title, the caption, and the hold.
 */
import type { Action, Element, Scene, Step } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

export interface Composition {
  id: string;
  name: string;
  /** The box of the elements, to place them again. */
  width: number;
  height: number;
  elements: Element[];
  steps: { title: string; holdMs: number; caption?: Step["caption"]; actions: Action[] }[];
  savedAt: number;
}

type Boxed = Element & { x: number; y: number; width: number; height: number };

const boxOf = (els: Element[]) => {
  const b = els.filter((e) => e.type !== "connector" && e.type !== "group") as Boxed[];
  if (b.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...b.map((e) => e.x));
  const y = Math.min(...b.map((e) => e.y));
  return { x, y, width: Math.max(...b.map((e) => e.x + e.width)) - x, height: Math.max(...b.map((e) => e.y + e.height)) - y };
};

/** The elements and their animations, for the selected elements (groups bring their parts, arrows between the elements come too). */
export function compositionOf(scene: Scene, ids: string[], name: string, id: string, savedAt = 0): Composition | { error: string } {
  const keep = new Set<string>();
  const addWithParts = (eid: string) => {
    if (keep.has(eid) || !scene.elements[eid]) return;
    keep.add(eid);
    for (const e of Object.values(scene.elements)) if (e.parentId === eid) addWithParts(e.id);
  };
  ids.forEach(addWithParts);
  for (const e of Object.values(scene.elements)) {
    if (e.type !== "connector") continue;
    const ends = [e.start, e.end].map((x) => (x.kind === "bound" ? x.elementId : null));
    if (ends.every((x) => x && keep.has(x))) keep.add(e.id);
  }
  if (keep.size === 0) return { error: "Select the elements to save." };
  const elements = [...keep].map((k) => scene.elements[k]!);
  const box = boxOf(elements);
  // Positions from the top-left of the box, so the composition can go anywhere.
  const moved = elements.map((e) => (e.type === "connector" || e.type === "group" ? e : ({ ...e, x: (e as Boxed).x - box.x, y: (e as Boxed).y - box.y } as Element)));
  const steps = scene.steps
    .map((s) => ({
      title: s.title,
      holdMs: s.holdMs,
      ...(s.caption && (!s.caption.anchor || keep.has(s.caption.anchor)) ? { caption: s.caption } : {}),
      actions: s.actions.filter((a) => a.targets.length > 0 && a.targets.every((t) => keep.has(t))),
    }))
    .filter((s) => s.actions.length > 0);
  return { id, name, width: box.width, height: box.height, elements: moved, steps, savedAt };
}

/**
 * The operations that insert a composition: the elements with new IDs at a
 * place, and its steps after a step (or at the end). Returns the new IDs.
 */
export function insertCompositionOps(scene: Scene, c: Composition, at: { x: number; y: number }, afterStep?: string): { ops: OperationInput[]; ids: string[]; steps: number } {
  const taken = new Set(Object.keys(scene.elements));
  const rename = new Map<string, string>();
  for (const e of c.elements) {
    let n = e.id;
    for (let k = 2; taken.has(n); k++) n = `${e.id}-${k}`;
    taken.add(n);
    rename.set(e.id, n);
  }
  const r = (id: string) => rename.get(id) ?? id;
  const ops: OperationInput[] = [];
  for (const e of c.elements) {
    const { id: _old, type, ...rest } = e as Element & Record<string, unknown>;
    void _old;
    const props: Record<string, unknown> = { ...rest };
    if (type !== "connector" && type !== "group") {
      props["x"] = Math.round(at.x + (props["x"] as number));
      props["y"] = Math.round(at.y + (props["y"] as number));
    }
    if (props["parentId"]) props["parentId"] = r(props["parentId"] as string);
    if (props["follow"]) props["follow"] = r(props["follow"] as string);
    for (const end of ["start", "end"] as const) {
      const x = props[end] as { kind: string; elementId?: string } | undefined;
      if (x?.kind === "bound" && x.elementId) props[end] = { ...x, elementId: r(x.elementId) };
    }
    ops.push({ op: "element.add", id: r(e.id), type, props });
  }
  let index = afterStep ? scene.steps.findIndex((s) => s.id === afterStep) + 1 : scene.steps.length;
  if (index <= 0) index = scene.steps.length;
  for (const s of c.steps) {
    const actions = s.actions.map((a) => {
      const { id: _a, ...rest } = a as Action & Record<string, unknown>;
      void _a;
      const out: Record<string, unknown> = { ...rest, targets: a.targets.map(r) };
      if (a.type === "motion" && a.motion.along) out["motion"] = { ...a.motion, along: r(a.motion.along) };
      if (a.type === "flow" && a.flow.chainFrom) out["flow"] = { ...a.flow, chainFrom: r(a.flow.chainFrom) };
      return out;
    });
    const caption = s.caption ? { ...s.caption, ...(s.caption.anchor ? { anchor: r(s.caption.anchor) } : {}) } : undefined;
    ops.push({ op: "step.add", index: index++, props: { title: s.title, holdMs: s.holdMs, ...(caption ? { caption } : {}), actions } });
  }
  return { ops, ids: c.elements.filter((e) => !e.parentId).map((e) => r(e.id)), steps: c.steps.length };
}
