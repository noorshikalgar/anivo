/**
 * Compositions in the editor (docs/20 B6): save the selected elements with
 * their animations, insert a composition in any scene, and move compositions
 * between computers as files. They are in this browser (IndexedDB).
 */
import { type Composition, compositionOf, insertCompositionOps } from "@anivo/ops";
import { idbGet, idbSet } from "./idb.js";
import { notify } from "./notify.js";
import { useEditor } from "./store.js";

const KEY = "compositions";

export async function listCompositions(): Promise<Composition[]> {
  return (await idbGet<Composition[]>(KEY).catch(() => undefined)) ?? [];
}

async function store(list: Composition[]): Promise<void> {
  await idbSet(KEY, list);
}

export async function saveSelectionAsComposition(name: string): Promise<Composition | null> {
  const st = useEditor.getState();
  const c = compositionOf(st.scene, st.selection, name.trim() || "My composition", `comp-${Date.now().toString(36)}`, Date.now());
  if ("error" in c) {
    notify(c.error, "info");
    return null;
  }
  await store([...(await listCompositions()), c]);
  notify(`Saved '${c.name}': ${c.elements.length} elements and ${c.steps.length} step${c.steps.length === 1 ? "" : "s"}. Insert it in any scene from Insert › Compositions.`, "success");
  return c;
}

export async function deleteComposition(id: string): Promise<void> {
  await store((await listCompositions()).filter((c) => c.id !== id));
}

/** Insert at the center of the view, with its steps after the selected step. */
export function insertComposition(c: Composition, texts: Record<string, string> = {}): void {
  const st = useEditor.getState();
  const center = { x: st.view.x + st.viewport.width / st.view.zoom / 2, y: st.view.y + st.viewport.height / st.view.zoom / 2 };
  const ins = insertCompositionOps(st.scene, c, { x: center.x - c.width / 2, y: center.y - c.height / 2 }, st.selectedStep ?? undefined, texts);
  const r = st.apply({ label: `Insert ${c.name}`, ops: ins.ops });
  if (!r.ok) return notify(r.error.message, "error");
  st.setSelection(ins.ids);
  notify(ins.steps ? `Inserted '${c.name}' with ${ins.steps} step${ins.steps === 1 ? "" : "s"}.` : `Inserted '${c.name}'.`, "success");
}

/** Download a composition as a file. */
export function exportComposition(c: Composition): void {
  const blob = new Blob([JSON.stringify({ anivoComposition: 1, ...c }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${c.name.replace(/[^\w-]+/g, "-").toLowerCase() || "composition"}.anivo-comp.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Add compositions from a file. */
export async function importComposition(file: File): Promise<Composition | null> {
  try {
    const data = JSON.parse(await file.text()) as Composition & { anivoComposition?: number };
    if (data.anivoComposition !== 1 || !Array.isArray(data.elements) || !Array.isArray(data.steps)) throw new Error("not a composition");
    const c: Composition = { id: `comp-${Date.now().toString(36)}`, name: data.name, width: data.width, height: data.height, elements: data.elements, steps: data.steps, savedAt: Date.now() };
    await store([...(await listCompositions()), c]);
    notify(`Added '${c.name}'.`, "success");
    return c;
  } catch {
    notify(`'${file.name}' is not an Anivo composition file.`, "error");
    return null;
  }
}
