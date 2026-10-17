import { prepare } from "@anivo/engine";
import { evaluateWithLayout } from "@anivo/layout";
import type { OperationInput } from "@anivo/ops";
import { type Box, elementBounds, geometryOps } from "./editing.js";
import { useEditor } from "./store.js";

/** Element boxes at the current playhead (the base state in the Base view). */
export function currentBoxes(): (id: string) => Box | undefined {
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

/**
 * Add an element. If a step is selected, the element enters in that step
 * with the default enter effect, so it does not show before the step.
 */
export function addElement(type: string, props: Record<string, unknown>, label = "Add element"): string | undefined {
  const st = useEditor.getState();
  const start = props["start"] as { kind?: string; elementId?: string } | undefined;
  const end = props["end"] as { kind?: string; elementId?: string } | undefined;
  // A connector between two elements gets a readable ID: c-<from>-<to>.
  const ops: OperationInput[] =
    type === "connector" && start?.kind === "bound" && end?.kind === "bound"
      ? [{ op: "element.connect", from: start.elementId!, to: end.elementId!, props: Object.fromEntries(Object.entries(props).filter(([k]) => k !== "start" && k !== "end")) }]
      : [{ op: "element.add", type, props }];
  const r = st.apply({ label, ops });
  if (!r.ok) return undefined;
  const id = r.created[0]!;
  if (st.selectedStep !== null) {
    const effect = type === "connector" ? "draw-on" : st.scene.settings.defaults.enterEffect;
    st.apply({ label: "Enter in step", ops: [{ op: "action.add", step: st.selectedStep, action: { type: "enter", effect, targets: [id] } }] });
  }
  st.setSelection([id]);
  return id;
}

/** Change the label of a shape, or the content of a text element. Empty text removes the label. */
export function setElementText(id: string, text: string): void {
  const st = useEditor.getState();
  const el = st.scene.elements[id];
  if (!el) return;
  const current = el.type === "text" ? el.content.text : (el.label?.text ?? "");
  if (current === text) return;
  if (el.type === "text") {
    if (text.trim() === "") st.apply({ label: "Delete text", ops: [{ op: "element.remove", ids: [id] }] });
    else st.apply({ label: "Edit text", ops: [{ op: "element.update", id, set: { content: { text } } }] });
  } else {
    st.apply({ label: "Edit label", ops: [{ op: "element.update", id, set: { label: text.trim() === "" ? null : { text } } }] });
  }
}

/** Properties that a morph can change (docs/06 "morph"). */
const MORPHABLE = new Set(["x", "y", "width", "height", "rotation", "opacity", "fill", "stroke", "strokeWidth", "cornerRadius", "fontSize", "textColor", "label"]);
const STYLE_KEYS = new Set(["fill", "stroke", "strokeWidth", "strokeStyle", "cornerRadius", "fontFamily", "fontSize", "fontWeight", "textColor", "textAlign", "roughness"]);

/**
 * Change properties of one element from the properties panel. In a step,
 * morphable properties of a visible element become a morph in that step
 * (FR-STEP-04). Other properties always change the element.
 */
export function commitProps(id: string, changes: Record<string, unknown>, label = "Change property"): void {
  const st = useEditor.getState();
  const el = st.scene.elements[id];
  if (!el) return;
  const inStep = st.selectedStep !== null && visibleAtStepStart()(id);
  const morph: Record<string, unknown> = {};
  const set: Record<string, unknown> = {};
  const style: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (inStep && MORPHABLE.has(k)) morph[k] = v;
    else if (STYLE_KEYS.has(k)) style[k] = v;
    else if (k === "label") set["label"] = v === "" || v === null ? null : { text: v };
    else set[k] = v;
  }
  if (Object.keys(style).length > 0) set["style"] = style;
  const ops: OperationInput[] = [];
  if (Object.keys(set).length > 0) ops.push({ op: "element.update", id, set });
  if (Object.keys(morph).length > 0) {
    const step = st.scene.steps.find((s) => s.id === st.selectedStep)!;
    const existing = step.actions.find((a) => a.type === "morph" && a.targets.length === 1 && a.targets[0] === id);
    if (existing && existing.type === "morph") ops.push({ op: "action.update", step: step.id, id: existing.id, set: { to: { ...existing.to, ...morph } } });
    else ops.push({ op: "action.add", step: step.id, action: { type: "morph", targets: [id], to: morph } });
  }
  if (ops.length > 0) st.apply({ label, ops });
}

/** Rename an element. Returns an error message, or undefined if the rename worked. */
export function renameElement(id: string, to: string): string | undefined {
  const st = useEditor.getState();
  if (id === to) return undefined;
  const r = st.apply({ label: "Rename", ops: [{ op: "element.rename", id, to }] });
  if (!r.ok) return r.error.message;
  st.setSelection([to]);
  return undefined;
}

export function reorderSelection(to: "front" | "back" | "forward" | "backward"): void {
  const st = useEditor.getState();
  const ops: OperationInput[] = st.selection.map((id) => ({ op: "element.reorder", id, to }));
  if (ops.length > 0) st.apply({ label: "Change order", ops });
}

/** Change scene settings. */
export function commitSettings(set: Record<string, unknown>, label = "Change scene settings"): void {
  useEditor.getState().apply({ label, ops: [{ op: "scene.settings", set }] });
}

// --- steps and actions --------------------------------------------------------

/** Add a step after the selected step (or at the end) and select it. */
export function addStep(): void {
  const st = useEditor.getState();
  const steps = st.scene.steps;
  const at = st.selectedStep === null ? steps.length : steps.findIndex((s) => s.id === st.selectedStep) + 1;
  const r = st.apply({ label: "Add step", ops: [{ op: "step.add", index: at, props: { title: `Step ${steps.length + 1}` } }] });
  if (r.ok) {
    st.selectStep(r.created[0]!);
    st.setSelection([]);
  }
}

export function duplicateStep(id: string): void {
  const st = useEditor.getState();
  const i = st.scene.steps.findIndex((s) => s.id === id);
  const step = st.scene.steps[i];
  if (!step) return;
  const actions = step.actions.map((a) => {
    const copy: Record<string, unknown> = { ...a };
    delete copy["id"];
    return copy;
  });
  const props: Record<string, unknown> = { ...step, title: `${step.title || step.id} (copy)`, actions };
  delete props["id"];
  const r = st.apply({ label: "Duplicate step", ops: [{ op: "step.add", index: i + 1, props }] });
  if (r.ok) st.selectStep(r.created[0]!);
}

export function deleteStep(id: string): void {
  const st = useEditor.getState();
  const i = st.scene.steps.findIndex((s) => s.id === id);
  const r = st.apply({ label: "Delete step", ops: [{ op: "step.remove", id }] });
  if (r.ok) st.selectStep(i > 0 ? st.scene.steps[i - 1]!.id : null);
}

export function moveStep(id: string, index: number): void {
  useEditor.getState().apply({ label: "Move step", ops: [{ op: "step.move", id, index }] });
}

export function updateStep(id: string, set: Record<string, unknown>, label = "Change step"): void {
  useEditor.getState().apply({ label, ops: [{ op: "step.update", id, set }] });
}

/** Add an action for the selected elements to the selected step. */
export function addAction(action: Record<string, unknown>, label = "Add action"): string | undefined {
  const st = useEditor.getState();
  if (st.selectedStep === null) return undefined;
  const r = st.apply({ label, ops: [{ op: "action.add", step: st.selectedStep, action }] });
  return r.ok ? r.created[0] : undefined;
}

export function updateAction(step: string, id: string, set: Record<string, unknown>, label = "Change action"): void {
  useEditor.getState().apply({ label, ops: [{ op: "action.update", step, id, set }] });
}

export function removeAction(step: string, id: string): void {
  useEditor.getState().apply({ label: "Remove action", ops: [{ op: "action.remove", step, id }] });
}
