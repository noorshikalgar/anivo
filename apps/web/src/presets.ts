/**
 * Motion presets in the editor (docs/20 B5): apply a built-in or saved
 * preset to the selection, and save the actions of the selected elements
 * as a preset. Saved presets are in this browser (IndexedDB).
 */
import { BUILTIN_PRESETS, type MotionPreset, capturePreset, presetOps } from "@anivo/ops";
import { idbGet, idbSet } from "./idb.js";
import { notify } from "./notify.js";
import { useEditor } from "./store.js";

const KEY = "motion-presets";

export async function listUserPresets(): Promise<MotionPreset[]> {
  return (await idbGet<MotionPreset[]>(KEY).catch(() => undefined)) ?? [];
}

export function allBuiltins(): MotionPreset[] {
  return BUILTIN_PRESETS;
}

/** Apply a preset to the selected elements in the selected step. */
export function applyPreset(preset: MotionPreset): boolean {
  const st = useEditor.getState();
  if (st.selectedStep === null) {
    notify("Select a step first (or press N for a new step).", "info");
    return false;
  }
  const ops = presetOps(st.scene, st.selectedStep, preset, st.selection);
  if ("error" in ops) {
    notify(ops.error, "info");
    return false;
  }
  const r = st.apply({ label: `Preset: ${preset.name}`, ops });
  if (!r.ok) notify(r.error.message, "error");
  return r.ok;
}

/** Save the actions of the selected elements in the selected step as a preset. */
export async function saveSelectionAsPreset(name: string): Promise<MotionPreset | null> {
  const st = useEditor.getState();
  const step = st.scene.steps.find((s) => s.id === st.selectedStep);
  if (!step) return null;
  const ids = step.actions.filter((a) => a.targets.some((t) => st.selection.includes(t))).map((a) => a.id);
  const p = capturePreset(st.scene, step.id, ids, name.trim() || "My preset", `user-${Date.now().toString(36)}`);
  if ("error" in p) {
    notify("Select elements that have actions in this step, then save.", "info");
    return null;
  }
  await idbSet(KEY, [...(await listUserPresets()), p]);
  notify(`Saved the preset '${p.name}'. It is in Presets, in every scene.`, "success");
  return p;
}

export async function deleteUserPreset(id: string): Promise<void> {
  await idbSet(KEY, (await listUserPresets()).filter((p) => p.id !== id));
}
