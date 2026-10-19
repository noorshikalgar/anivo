import { prepare } from "@anivo/engine";
import { type LayoutKind, autoLayout, evaluateWithLayout } from "@anivo/layout";
import type { OperationInput } from "@anivo/ops";
import type { Element } from "@anivo/schema";
import { type Box, boundsOf, editorSkip, geometryOps, leafDescendants } from "./editing.js";
import { useEditor } from "./store.js";

/** Element boxes at the current playhead (the base state in the Base view). */
export function currentBoxes(): (id: string) => Box | undefined {
  const { scene, playhead, playing, selectedStep } = useEditor.getState();
  const t = !playing && selectedStep === null && playhead === 0 ? -1 : playhead;
  const { frame, routes } = evaluateWithLayout(scene, t);
  return (id) => boundsOf(scene, frame, routes, id);
}

/** Selected elements that move: groups become their elements, connectors stay with their bindings. */
export function movableIds(ids: string[]): string[] {
  const { scene } = useEditor.getState();
  return [...new Set(ids.flatMap((id) => leafDescendants(scene, id)))].filter((id) => scene.elements[id]?.type !== "connector");
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
  for (const id of movableIds(st.selection)) {
    const b = box(id);
    if (b) changes.set(id, { ...b, x: b.x + dx, y: b.y + dy });
  }
  commitGeometry(changes, "Move element");
}

export function deleteSelection(): void {
  const st = useEditor.getState();
  if (st.selection.length === 0) return;
  const ids = [...new Set(st.selection.flatMap((id) => [id, ...allDescendants(st.scene.elements, id)]))];
  const r = st.apply({ label: "Delete", ops: [{ op: "element.remove", ids }] });
  if (r.ok) st.setSelection([]);
}

/** Duplicate the selected elements with an offset of 24 px. */
export function duplicateSelection(): void {
  const data = copyData(useEditor.getState().selection);
  if (data) pasteData(data, 24);
}

export function selectAll(): void {
  const st = useEditor.getState();
  const skip = editorSkip(st.scene, true);
  st.setSelection(Object.keys(st.scene.elements).filter((id) => !skip(id)));
}

/** Lock or unlock the selected elements (FR-CANVAS-18). A locked element cannot be picked on the canvas. */
export function toggleLockSelection(): void {
  const st = useEditor.getState();
  const ids = st.selection.filter((id) => id in st.scene.elements);
  if (ids.length === 0) return;
  const lock = !ids.every((id) => st.scene.elements[id]!.locked);
  st.apply({ label: lock ? "Lock" : "Unlock", ops: ids.map((id) => ({ op: "element.update" as const, id, set: { locked: lock } })) });
  if (lock) st.setSelection([]);
}

/** Hide the selected elements in the editor, or show them again. The video still shows them. */
export function toggleHideSelection(): void {
  const st = useEditor.getState();
  const ids = st.selection.filter((id) => id in st.scene.elements);
  if (ids.length === 0) return;
  const hide = !ids.every((id) => st.scene.elements[id]!.editorHidden);
  st.apply({ label: hide ? "Hide in editor" : "Show in editor", ops: ids.map((id) => ({ op: "element.update" as const, id, set: { editorHidden: hide } })) });
  if (hide) st.setSelection([]);
}

/** Unlock all elements and show all hidden elements. */
export function unlockAndShowAll(): void {
  const st = useEditor.getState();
  const ops = Object.values(st.scene.elements)
    .filter((e) => e.locked || e.editorHidden)
    .map((e) => ({ op: "element.update" as const, id: e.id, set: { locked: false, editorHidden: false } }));
  if (ops.length > 0) st.apply({ label: "Unlock and show all", ops });
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

/** Add a table of 3 rows and 3 columns at the center of the view (FR-CANVAS-15). Double-click a cell to edit it. */
export function insertTable(rows = 3, cols = 3): string | undefined {
  const st = useEditor.getState();
  const width = cols * 200;
  const height = rows * 64;
  const cx = st.view.x + st.viewport.width / st.view.zoom / 2;
  const cy = st.view.y + st.viewport.height / st.view.zoom / 2;
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? `Column ${c + 1}` : "")));
  st.setTool("select");
  return addElement("table", { x: Math.round(cx - width / 2), y: Math.round(cy - height / 2), width, height, rows, cols, cells }, "Insert table");
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
const MORPHABLE = new Set(["x", "y", "width", "height", "rotation", "opacity", "fill", "stroke", "strokeWidth", "cornerRadius", "fontSize", "textColor", "label", "shape"]);
const STYLE_KEYS = new Set(["fill", "stroke", "strokeWidth", "strokeStyle", "cornerRadius", "fontFamily", "fontSize", "fontWeight", "textColor", "textAlign", "roughness"]);

/**
 * Change properties of one element from the properties panel. In a step,
 * morphable properties of a visible element become a morph in that step
 * (FR-STEP-04). Other properties always change the element.
 */
export function commitProps(id: string, changes: Record<string, unknown>, label = "Change property", mergeKey?: string): void {
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
    else if (k === "label" && el.type === "text") set["content"] = { text: String(v ?? "") };
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
  if (ops.length > 0) st.apply({ label, ops, ...(mergeKey ? { mergeKey } : {}) });
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

export function updateStep(id: string, set: Record<string, unknown>, label = "Change step", mergeKey?: string): void {
  useEditor.getState().apply({ label, ops: [{ op: "step.update", id, set }], ...(mergeKey ? { mergeKey } : {}) });
}

/** Add an action for the selected elements to the selected step. */
export function addAction(action: Record<string, unknown>, label = "Add action"): string | undefined {
  const st = useEditor.getState();
  if (st.selectedStep === null) return undefined;
  const r = st.apply({ label, ops: [{ op: "action.add", step: st.selectedStep, action }] });
  return r.ok ? r.created[0] : undefined;
}

export function updateAction(step: string, id: string, set: Record<string, unknown>, label = "Change action", mergeKey?: string): void {
  useEditor.getState().apply({ label, ops: [{ op: "action.update", step, id, set }], ...(mergeKey ? { mergeKey } : {}) });
}

/** Move an action one place up or down in its step. */
export function moveAction(stepId: string, id: string, dir: -1 | 1): void {
  const st = useEditor.getState();
  const step = st.scene.steps.find((s) => s.id === stepId);
  const i = step?.actions.findIndex((a) => a.id === id) ?? -1;
  const to = i + dir;
  if (!step || i < 0 || to < 0 || to >= step.actions.length) return;
  st.apply({ label: "Move action", ops: [{ op: "action.remove", step: stepId, id }, { op: "action.add", step: stepId, index: to, action: step.actions[i]! }] });
}

/** Action types that split into one action for each target. A camera or a flow uses all its targets together. */
const SPLITTABLE = new Set(["enter", "exit", "morph", "emphasis", "motion"]);

export function canSplitAction(a: { type: string; targets: string[] }): boolean {
  return SPLITTABLE.has(a.type) && a.targets.length > 1;
}

/**
 * Split an action with more than one target into one action for each target,
 * so that each element can have its own delay and duration. The stagger
 * becomes a delay of each new action, so the animation does not change.
 */
export function splitAction(stepId: string, actionId: string): void {
  const st = useEditor.getState();
  const step = st.scene.steps.find((s) => s.id === stepId);
  const index = step?.actions.findIndex((a) => a.id === actionId) ?? -1;
  const action = step?.actions[index];
  if (!step || !action || !canSplitAction(action)) return;
  const rest: Record<string, unknown> = { ...action };
  delete rest["id"];
  const ops: OperationInput[] = [{ op: "action.remove", step: stepId, id: actionId }];
  action.targets.forEach((t, k) => ops.push({ op: "action.add", step: stepId, index: index + k, action: { ...rest, targets: [t], delayMs: action.delayMs + k * action.staggerMs, staggerMs: 0 } }));
  st.apply({ label: "Split action", ops });
}

export function removeAction(step: string, id: string): void {
  useEditor.getState().apply({ label: "Remove action", ops: [{ op: "action.remove", step, id }] });
}

// --- groups, clipboard, align ------------------------------------------------

function allDescendants(elements: Record<string, Element>, id: string): string[] {
  const out: string[] = [];
  for (const el of Object.values(elements)) if (el.parentId === id) out.push(el.id, ...allDescendants(elements, el.id));
  return out;
}

export function groupSelection(): void {
  const st = useEditor.getState();
  // Group the top-level elements of the selection. Connectors join the group too.
  const ids = [...new Set(st.selection.filter((id) => st.scene.elements[id]))];
  if (ids.length < 2) return;
  let id = "group";
  for (let n = 2; id in st.scene.elements; n++) id = `group-${n}`;
  const r = st.apply({
    label: "Group",
    ops: [{ op: "element.add", id, type: "group", props: {} }, ...ids.map((child): OperationInput => ({ op: "element.update", id: child, set: { parentId: id } }))],
  });
  if (r.ok) st.setSelection([id]);
}

export function ungroupSelection(): void {
  const st = useEditor.getState();
  const groups = st.selection.filter((id) => st.scene.elements[id]?.type === "group");
  if (groups.length === 0) return;
  const children = Object.values(st.scene.elements).filter((e) => e.parentId && groups.includes(e.parentId)).map((e) => e.id);
  // Removing a group keeps its elements (docs/09 element.remove).
  const r = st.apply({ label: "Ungroup", ops: [{ op: "element.remove", ids: groups }] });
  if (r.ok) st.setSelection(children);
}

const CLIP_PREFIX = "anivo-clipboard:";

interface ClipData {
  elements: Element[];
}

/** Elements to copy: the selection, the elements in selected groups, and connectors between copied elements. */
export function copyData(ids: string[]): ClipData | undefined {
  const { scene } = useEditor.getState();
  const set = new Set(ids.flatMap((id) => [id, ...allDescendants(scene.elements, id)]));
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "connector" || set.has(el.id)) continue;
    const a = el.start.kind === "bound" ? el.start.elementId : null;
    const b = el.end.kind === "bound" ? el.end.elementId : null;
    if (a && b && set.has(a) && set.has(b)) set.add(el.id);
  }
  const elements = [...set].map((id) => scene.elements[id]).filter((e): e is Element => !!e).sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0));
  return elements.length > 0 ? { elements } : undefined;
}

/** Add copies of elements with new IDs. References inside the copied set point to the copies. */
export function pasteData(data: ClipData, offset: number): void {
  const st = useEditor.getState();
  const taken = new Set(Object.keys(st.scene.elements));
  const map = new Map<string, string>();
  for (const el of data.elements) {
    // The copy of 'pod-1' is 'pod-1-2', then 'pod-1-3'.
    const base = el.id.slice(0, 44);
    let id = `${base}-2`;
    for (let n = 3; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    map.set(el.id, id);
  }
  const ops: OperationInput[] = data.elements.map((el) => {
    const props: Record<string, unknown> = { ...el };
    for (const k of ["id", "z", "seed", "type"]) delete props[k];
    if (el.parentId) {
      const p = map.get(el.parentId);
      if (p) props["parentId"] = p;
      else delete props["parentId"];
    }
    if (el.type === "connector") {
      const fix = (e: typeof el.start) => {
        if (e.kind !== "bound") return { ...e, x: e.x + offset, y: e.y + offset };
        const to = map.get(e.elementId);
        return to ? { ...e, elementId: to } : st.scene.elements[e.elementId] ? e : { kind: "free", x: 0, y: 0 };
      };
      props["start"] = fix(el.start);
      props["end"] = fix(el.end);
    } else if (el.type !== "group") {
      props["x"] = el.x + offset;
      props["y"] = el.y + offset;
    }
    return { op: "element.add", id: map.get(el.id)!, type: el.type, props };
  });
  // A child refers to its group, so add groups first.
  ops.sort((a, b) => ((a as { type: string }).type === "group" ? -1 : 0) - ((b as { type: string }).type === "group" ? -1 : 0));
  const r = st.apply({ label: "Paste", ops });
  if (r.ok) {
    const roots = data.elements.filter((e) => !e.parentId || !map.has(e.parentId)).map((e) => map.get(e.id)!);
    st.setSelection(roots);
  }
}

export async function copySelection(cut = false): Promise<void> {
  const st = useEditor.getState();
  const data = copyData(st.selection);
  if (!data) return;
  const text = CLIP_PREFIX + JSON.stringify(data);
  internalClipboard = text;
  await navigator.clipboard?.writeText(text).catch(() => undefined);
  if (cut) deleteSelection();
}

let internalClipboard = "";

export async function pasteFromClipboard(systemText?: string): Promise<void> {
  let text = internalClipboard;
  try {
    const sys = systemText ?? (await navigator.clipboard?.readText());
    if (sys?.startsWith(CLIP_PREFIX)) text = sys;
  } catch {
    // No clipboard permission: use the copy from this page.
  }
  if (!text.startsWith(CLIP_PREFIX)) return;
  try {
    pasteData(JSON.parse(text.slice(CLIP_PREFIX.length)) as ClipData, 24);
  } catch {
    // Not valid clipboard data. Ignore it.
  }
}

export type AlignKind = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Align the selected elements to the bounds of the selection (FR-CANVAS-07). */
export function alignSelection(kind: AlignKind): void {
  const st = useEditor.getState();
  const box = currentBoxes();
  const items = st.selection.map((id) => ({ id, b: box(id) })).filter((x): x is { id: string; b: Box } => !!x.b && st.scene.elements[x.id]?.type !== "connector");
  if (items.length < 2) return;
  const minX = Math.min(...items.map((i) => i.b.x));
  const maxX = Math.max(...items.map((i) => i.b.x + i.b.width));
  const minY = Math.min(...items.map((i) => i.b.y));
  const maxY = Math.max(...items.map((i) => i.b.y + i.b.height));
  const changes = new Map<string, Box>();
  for (const { id, b } of items) {
    const n = { ...b };
    if (kind === "left") n.x = minX;
    if (kind === "center") n.x = (minX + maxX) / 2 - b.width / 2;
    if (kind === "right") n.x = maxX - b.width;
    if (kind === "top") n.y = minY;
    if (kind === "middle") n.y = (minY + maxY) / 2 - b.height / 2;
    if (kind === "bottom") n.y = maxY - b.height;
    moveGroupAware(id, b, n, changes, box);
  }
  commitGeometry(changes, "Align");
}

/** Equal space between the selected elements (FR-CANVAS-07). */
export function distributeSelection(axis: "horizontal" | "vertical"): void {
  const st = useEditor.getState();
  const box = currentBoxes();
  const items = st.selection.map((id) => ({ id, b: box(id) })).filter((x): x is { id: string; b: Box } => !!x.b && st.scene.elements[x.id]?.type !== "connector");
  if (items.length < 3) return;
  const h = axis === "horizontal";
  items.sort((a, b) => (h ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = items[0]!.b;
  const last = items[items.length - 1]!.b;
  const span = h ? last.x + last.width - first.x : last.y + last.height - first.y;
  const sizes = items.reduce((s, i) => s + (h ? i.b.width : i.b.height), 0);
  const gap = (span - sizes) / (items.length - 1);
  let pos = h ? first.x : first.y;
  const changes = new Map<string, Box>();
  for (const { id, b } of items) {
    const n = h ? { ...b, x: pos } : { ...b, y: pos };
    pos += (h ? b.width : b.height) + gap;
    moveGroupAware(id, b, n, changes, box);
  }
  commitGeometry(changes, "Distribute");
}

/** Add the geometry change for an element. A group moves its elements by the same offset. */
function moveGroupAware(id: string, from: Box, to: Box, changes: Map<string, Box>, box: (id: string) => Box | undefined): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (const leaf of movableIds([id])) {
    const b = box(leaf);
    if (b) changes.set(leaf, { ...b, x: b.x + dx, y: b.y + dy });
  }
}

/**
 * Automatic layout of the selected elements (FR-CANVAS-16). Arrows between
 * them give the order for tree and layered layouts. In a step, the moves
 * become morphs, like a drag.
 */
export function autoLayoutSelection(kind: LayoutKind): void {
  const st = useEditor.getState();
  const box = currentBoxes();
  const ids = movableIds(st.selection);
  const nodes = ids.flatMap((id) => {
    const b = box(id);
    return b ? [{ id, width: b.width, height: b.height, x: b.x, y: b.y }] : [];
  });
  if (nodes.length < 2) return;
  const set = new Set(ids);
  const edges = Object.values(st.scene.elements).flatMap((c) =>
    c.type === "connector" && c.start.kind === "bound" && c.end.kind === "bound" && set.has(c.start.elementId) && set.has(c.end.elementId) ? [{ from: c.start.elementId, to: c.end.elementId }] : [],
  );
  const origin = { x: Math.min(...nodes.map((n) => n.x)), y: Math.min(...nodes.map((n) => n.y)) };
  const result = autoLayout(nodes, edges, { kind, origin });
  const changes = new Map<string, Box>();
  for (const n of nodes) {
    const p = result.get(n.id);
    if (p) changes.set(n.id, { x: p.x, y: p.y, width: n.width, height: n.height });
  }
  commitGeometry(changes, `Auto layout: ${kind}`);
}

/**
 * Motion path (FR-STEP-15): the selected elements move along the selected arrow,
 * in the selected step. The path is a copy of the arrow route at the step start.
 */
export function addMotionAlongArrow(): void {
  const st = useEditor.getState();
  if (st.selectedStep === null) return;
  const conns = st.selection.filter((id) => st.scene.elements[id]?.type === "connector");
  const targets = st.selection.filter((id) => st.scene.elements[id] && st.scene.elements[id]!.type !== "connector");
  if (conns.length !== 1 || targets.length === 0) return;
  const start = st.timeline.steps.find((s) => s.id === st.selectedStep)?.startMs ?? 0;
  const route = evaluateWithLayout(st.scene, Math.max(0, start - 1)).routes.get(conns[0]!);
  if (!route || route.points.length < 2) return;
  addAction({ type: "motion", targets, motion: { points: route.points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) } }, "Add motion path");
}
