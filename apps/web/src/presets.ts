/**
 * Motion presets in the editor (docs/20 B5): apply a built-in or saved
 * preset to the selection, and save the actions of the selected elements
 * as a preset. Saved presets are in this browser (IndexedDB).
 */
import { BUILTIN_PRESETS, type MotionPreset, capturePreset, presetOps } from "@anivo/ops";
import { idbGet, idbSet } from "./idb.js";
import { notify } from "./notify.js";
import { delayAtPlayhead, ensureStep } from "./commands.js";
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
  if (useEditor.getState().selection.length === 0) {
    notify("Select the elements first.", "info");
    return false;
  }
  const step = ensureStep();
  if (step === null) return false;
  const st = useEditor.getState();
  const ops = presetOps(st.scene, step, preset, st.selection, { delayMs: delayAtPlayhead(step) });
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
  useEditor.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
  notify(`Saved the preset '${p.name}'. It is in Presets, in every scene.`, "success");
  return p;
}

export async function deleteUserPreset(id: string): Promise<void> {
  await idbSet(KEY, (await listUserPresets()).filter((p) => p.id !== id));
  useEditor.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
}

/** Download your presets as one file (docs/21 C11). */
export async function exportUserPresets(): Promise<void> {
  const list = await listUserPresets();
  if (list.length === 0) return notify("You have no saved presets yet.", "info");
  const blob = new Blob([JSON.stringify({ anivoPresets: 1, presets: list }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my-presets.anivo-presets.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const isPreset = (p: unknown): p is MotionPreset => {
  const x = p as MotionPreset;
  return typeof x?.name === "string" && (x.mode === "each" || x.mode === "roles") && Array.isArray(x.actions) && x.actions.every((a) => typeof a?.action?.type === "string");
};

/** Add the presets of a file. A preset with the same name as one of yours replaces it. */
export async function importUserPresets(file: File): Promise<number> {
  try {
    const data = JSON.parse(await file.text()) as { anivoPresets?: number; presets?: unknown[] };
    if (data.anivoPresets !== 1 || !Array.isArray(data.presets)) throw new Error("not a preset file");
    const found = data.presets.filter(isPreset);
    if (found.length === 0) throw new Error("no presets");
    const stamp = Date.now().toString(36);
    const added = found.map((p, i) => ({ id: `user-${stamp}-${i}`, name: p.name, description: p.description ?? "", mode: p.mode, actions: p.actions, ...(p.staggerMs !== undefined ? { staggerMs: p.staggerMs } : {}) }));
    const names = new Set(added.map((p) => p.name));
    await idbSet(KEY, [...(await listUserPresets()).filter((p) => !names.has(p.name)), ...added]);
    useEditor.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
    notify(`Added ${added.length} preset${added.length === 1 ? "" : "s"}.`, "success");
    return added.length;
  } catch {
    notify(`'${file.name}' is not an Anivo preset file.`, "error");
    return 0;
  }
}
