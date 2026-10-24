/**
 * Build (docs/30 B1): one click animates a diagram. The shapes rise in reading
 * order (top to bottom, then left to right), then the arrows between them draw,
 * chained to the shapes (`after`), so a later change of timing keeps the order.
 */
import type { Scene } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

type Box = { x: number; y: number; width: number; height: number };

function boxOf(scene: Scene, id: string): Box | undefined {
  const el = scene.elements[id];
  if (!el || el.type === "connector") return undefined;
  if (el.type !== "group") return el;
  const parts = Object.values(scene.elements)
    .filter((e) => e.parentId === id)
    .map((e) => boxOf(scene, e.id))
    .filter((b): b is Box => !!b);
  if (parts.length === 0) return undefined;
  const x = Math.min(...parts.map((b) => b.x));
  const y = Math.min(...parts.map((b) => b.y));
  return { x, y, width: Math.max(...parts.map((b) => b.x + b.width)) - x, height: Math.max(...parts.map((b) => b.y + b.height)) - y };
}

export function buildOps(scene: Scene, stepId: string, ids: string[], o: { staggerMs?: number } = {}): OperationInput[] | { error: string } {
  const step = scene.steps.find((s) => s.id === stepId);
  if (!step) return { error: "Select a step first." };
  const top = (id: string): string => {
    const p = scene.elements[id]?.parentId;
    return p && ids.includes(p) ? top(p) : id;
  };
  const shapes = [...new Set(ids.map(top))].filter((id) => scene.elements[id] && scene.elements[id]!.type !== "connector");
  if (shapes.length === 0) return { error: "Select the elements of the diagram first." };
  const center = (id: string) => {
    const b = boxOf(scene, id)!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, h: b.height };
  };
  // Reading order: rows of about the height of a shape, then left to right.
  const row = Math.max(40, Math.min(...shapes.map((id) => center(id).h)) * 0.6);
  shapes.sort((a, b) => {
    const ca = center(a);
    const cb = center(b);
    const ra = Math.round(ca.y / row);
    const rb = Math.round(cb.y / row);
    return ra !== rb ? ra - rb : ca.x - cb.x;
  });
  const inBuild = new Set<string>();
  const addParts = (id: string) => {
    inBuild.add(id);
    for (const e of Object.values(scene.elements)) if (e.parentId === id) addParts(e.id);
  };
  shapes.forEach(addParts);
  const arrows = Object.values(scene.elements)
    .filter((e) => e.type === "connector" && (ids.includes(e.id) || [e.start, e.end].every((x) => x.kind !== "bound" || inBuild.has(x.elementId))) && [e.start, e.end].some((x) => x.kind === "bound" && inBuild.has(x.elementId)))
    .map((e) => e.id);
  const taken = new Set(scene.steps.flatMap((s) => s.actions.map((a) => a.id)));
  const fresh = (base: string) => {
    let n = base;
    for (let k = 2; taken.has(n); k++) n = `${base}-${k}`;
    taken.add(n);
    return n;
  };
  const shapesId = fresh("build-shapes");
  const ops: OperationInput[] = [{ op: "action.add", step: stepId, action: { id: shapesId, type: "enter", effect: "rise", targets: shapes, staggerMs: o.staggerMs ?? 180 } }];
  if (arrows.length) ops.push({ op: "action.add", step: stepId, action: { id: fresh("build-arrows"), type: "enter", effect: "draw-on", targets: arrows, staggerMs: 120, after: shapesId } });
  return ops;
}
