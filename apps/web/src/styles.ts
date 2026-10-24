/**
 * Style presets in the editor (docs/21 C12): copy the look of an element and
 * paste it on others, and save looks to use in every scene (IndexedDB).
 */
import { BUILTIN_STYLES, type StylePreset, applyLookOps, lookOf } from "@anivo/ops";
import type { ElementStyle } from "@anivo/schema";
import { idbGet, idbSet } from "./idb.js";
import { notify } from "./notify.js";
import { useEditor } from "./store.js";

const KEY = "style-presets";
let copied: ElementStyle | null = null;

export const builtinStyles = (): StylePreset[] => BUILTIN_STYLES;

export async function listUserStyles(): Promise<StylePreset[]> {
  return (await idbGet<StylePreset[]>(KEY).catch(() => undefined)) ?? [];
}

/** Give the selected elements a look. */
export function applyLook(style: ElementStyle, name: string): void {
  const st = useEditor.getState();
  if (st.selection.length === 0) return notify("Select the elements first.", "info");
  const r = st.apply({ label: `Style: ${name}`, ops: applyLookOps(st.scene, st.selection, style) });
  if (!r.ok) notify(r.error.message, "error");
}

/** Ctrl+Alt+C: copy the look of the first selected element. */
export function copyLook(): void {
  const st = useEditor.getState();
  const look = st.selection[0] ? lookOf(st.scene, st.selection[0]) : undefined;
  if (!look) return notify("Select an element to copy its style.", "info");
  copied = look;
  notify("Copied the style. Select other elements and press Ctrl+Alt+V.", "info");
}

/** Ctrl+Alt+V: paste the copied look on the selection. */
export function pasteLook(): void {
  if (!copied) return notify("Copy a style first (Ctrl+Alt+C).", "info");
  applyLook(copied, "Paste");
}

export async function saveLook(name: string): Promise<StylePreset | null> {
  const st = useEditor.getState();
  const look = st.selection[0] ? lookOf(st.scene, st.selection[0]) : undefined;
  if (!look) {
    notify("Select an element to save its style.", "info");
    return null;
  }
  const p: StylePreset = { id: `style-${Date.now().toString(36)}`, name: name.trim() || "My style", style: look };
  await idbSet(KEY, [...(await listUserStyles()), p]);
  useEditor.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
  notify(`Saved the style '${p.name}'. It is in Styles, in every scene.`, "success");
  return p;
}

export async function deleteUserStyle(id: string): Promise<void> {
  await idbSet(KEY, (await listUserStyles()).filter((p) => p.id !== id));
  useEditor.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
}
