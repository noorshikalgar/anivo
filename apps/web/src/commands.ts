import { prepare } from "@anivo/engine";
import { evaluateWithLayout } from "@anivo/layout";
import type { OperationInput } from "@anivo/ops";
import { type Box, elementBounds, geometryOps } from "./editing.js";
import { useEditor } from "./store.js";

/** Element boxes at the current playhead. */
function currentBoxes(): (id: string) => Box | undefined {
  const { scene, playhead, playing, selectedStep } = useEditor.getState();
  const t = !playing && selectedStep === null && playhead === 0 ? -1 : playhead;
  const { frame, routes } = evaluateWithLayout(scene, t);
  const byId = new Map(frame.elements.map((f) => [f.id, f]));
  return (id) => {
    const f = byId.get(id);
    return f ? elementBounds(f, routes) : undefined;
  };
}

/** Is the element visible at the start of the selected step? */
function visibleAtStepStart(): (id: string) => boolean {
  const { scene, selectedStep } = useEditor.getState();
  const i = scene.steps.findIndex((st) => st.id === selectedStep);
  if (i < 0) return () => false;
  const p = prepare(scene);
  const state = i === 0 ? p.base : p.boundaries[i - 1]!;
  return (id) => state[id]?.visible ?? false;
}

/** Apply a geometry change in the base state or as a morph in the selected step. */
export function commitGeometry(changes: Map<string, Box>, label: string): void {
  const st = useEditor.getState();
  const ops = geometryOps(st.scene, st.selectedStep, visibleAtStepStart(), changes, currentBoxes());
  if (ops.length > 0) st.apply({ label, ops });
}

/** Move the selected elements by (dx, dy) scene pixels. */
export function nudgeSelection(dx: number, dy: number): void {
  const st = useEditor.getState();
  const box = currentBoxes();
  const changes = new Map<string, Box>();
  for (const id of st.selection) {
    if (st.scene.elements[id]?.type === "connector") continue;
    const b = box(id);
    if (b) changes.set(id, { ...b, x: b.x + dx, y: b.y + dy });
  }
  commitGeometry(changes, "Move element");
}

export function deleteSelection(): void {
  const st = useEditor.getState();
  if (st.selection.length === 0) return;
  const r = st.apply({ label: "Delete", ops: [{ op: "element.remove", ids: st.selection }] });
  if (r.ok) st.setSelection([]);
}

/** Duplicate the selected elements with an offset of 24 px. Connectors keep their bindings. */
export function duplicateSelection(): void {
  const st = useEditor.getState();
  const ops: OperationInput[] = [];
  for (const id of st.selection) {
    const el = st.scene.elements[id];
    if (!el) continue;
    // The copy gets a new ID, a new draw order key (on top), and a new seed.
    const props: Record<string, unknown> = { ...el };
    delete props["id"];
    delete props["z"];
    delete props["seed"];
    delete props["type"];
    ops.push({ op: "element.add", type: el.type, props: el.type === "connector" ? props : { ...props, x: el.x + 24, y: el.y + 24 } });
  }
  if (ops.length === 0) return;
  const r = st.apply({ label: "Duplicate", ops });
  if (r.ok) st.setSelection(r.created);
}

export function selectAll(): void {
  const st = useEditor.getState();
  st.setSelection(Object.keys(st.scene.elements));
}
