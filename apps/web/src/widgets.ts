/**
 * Widgets in the editor (docs/05 "Widgets"): insert a built-in widget, or a
 * widget that the user saved from a selection. The user widgets are in this
 * browser (IndexedDB).
 */
import { WIDGETS, type WidgetDef, widgetOps } from "@anivo/ops";
import type { Element } from "@anivo/schema";
import { copyData, pasteData } from "./commands.js";
import { idbGet, idbSet } from "./idb.js";
import { notify } from "./notify.js";
import { useEditor } from "./store.js";

export interface UserWidget {
  id: string;
  name: string;
  elements: Element[];
  width: number;
  height: number;
  savedAt: number;
}

const KEY = "widgets";

export async function listUserWidgets(): Promise<UserWidget[]> {
  return (await idbGet<UserWidget[]>(KEY).catch(() => undefined)) ?? [];
}

/** The box of elements (not connectors, not groups). */
function bounds(elements: Element[]): { x: number; y: number; width: number; height: number } {
  const boxes = elements.filter((e) => e.type !== "connector" && e.type !== "group") as (Element & { x: number; y: number; width: number; height: number })[];
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}

/** The center of the view, in scene pixels. */
function viewCenter(): { x: number; y: number } {
  const st = useEditor.getState();
  return { x: st.view.x + st.viewport.width / st.view.zoom / 2, y: st.view.y + st.viewport.height / st.view.zoom / 2 };
}

/** Insert a built-in widget at the center of the view, and select it. */
export function insertWidget(def: WidgetDef, at?: { x: number; y: number }): void {
  const st = useEditor.getState();
  let id = def.name;
  for (let n = 2; Object.keys(st.scene.elements).some((k) => k === id || k.startsWith(`${id}-`)); n++) id = `${def.name}-${n}`;
  const c = at ?? viewCenter();
  const r = st.apply({ label: `Insert ${def.title.toLowerCase()}`, ops: widgetOps(def, { id, x: Math.round(c.x - def.width / 2), y: Math.round(c.y - def.height / 2) }) });
  if (!r.ok) notify(r.error.message, "error");
  else {
    st.setTool("select");
    st.setSelection([id]);
  }
}

/** Save the selection as a user widget. */
export async function saveSelectionAsWidget(name: string): Promise<void> {
  const data = copyData(useEditor.getState().selection);
  if (!data) throw new Error("Select the elements of the widget first.");
  if (data.elements.some((e) => e.type === "image")) notify("Images are not kept in a widget. The other elements are saved.", "info");
  const elements = data.elements.filter((e) => e.type !== "image");
  const b = bounds(elements);
  const list = await listUserWidgets();
  list.unshift({ id: crypto.randomUUID().slice(0, 8), name: name.trim() || "Widget", elements, width: b.width, height: b.height, savedAt: Date.now() });
  await idbSet(KEY, list);
  useEditor.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
  notify(`Saved the widget "${name.trim() || "Widget"}".`, "success");
}

export async function deleteUserWidget(id: string): Promise<void> {
  await idbSet(KEY, (await listUserWidgets()).filter((w) => w.id !== id));
  useEditor.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
}

/** Insert a user widget at the center of the view. */
export function insertUserWidget(w: UserWidget, at?: { x: number; y: number }): void {
  const b = bounds(w.elements);
  const c = at ?? viewCenter();
  pasteData({ elements: w.elements }, 0, { dx: Math.round(c.x - b.width / 2 - b.x), dy: Math.round(c.y - b.height / 2 - b.y) }, `Insert widget ${w.name}`);
  useEditor.getState().setTool("select");
}

export { WIDGETS };
