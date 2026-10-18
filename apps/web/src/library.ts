/**
 * The scene library (FR-FILE-09): all scenes that the user made in this
 * browser, in IndexedDB. The editor saves the open scene to its entry 1 second
 * after each change (FR-FILE-03). The home screen lists the entries.
 *
 * Keys: "library" (the list of entries), "scene:<id>" (the scene JSON),
 * "assets:<id>" (the asset bytes).
 */
import { resolveTimeline } from "@anivo/engine";
import { type AssetStore, packArchive, sceneToJson, unpack } from "@anivo/fileio";
import { type Ctx2D, renderScene } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import { idbDelete, idbGet, idbSet } from "./idb.js";
import { useEditor } from "./store.js";

export interface LibraryEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  steps: number;
  durationMs: number;
  /** A small picture of the end of the last step (data URL). */
  thumb?: string;
  fileName: string | null;
}

const LIST = "library";
const sceneKey = (id: string) => `scene:${id}`;
const assetsKey = (id: string) => `assets:${id}`;

export function newLibraryId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function listScenes(): Promise<LibraryEntry[]> {
  const list = (await idbGet<LibraryEntry[]>(LIST).catch(() => undefined)) ?? [];
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function writeList(list: LibraryEntry[]): Promise<void> {
  await idbSet(LIST, list);
  useEditor.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
}

/** A picture of the end of the last step, 320 px on the long side. */
function thumbnail(scene: Scene): string | undefined {
  try {
    const { width: w, height: h } = scene.settings.video;
    const k = 320 / Math.max(w, h);
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const tl = resolveTimeline(scene);
    const last = tl.steps[tl.steps.length - 1];
    renderScene(c.getContext("2d") as unknown as Ctx2D, scene, last ? Math.max(last.startMs, last.holdEndMs - 1) : -1, { width: c.width, height: c.height });
    return c.toDataURL("image/webp", 0.8);
  } catch {
    return undefined;
  }
}

function entryFor(id: string, scene: Scene, fileName: string | null, old?: LibraryEntry): LibraryEntry {
  const thumb = thumbnail(scene);
  return {
    id,
    title: scene.meta.title.trim() || "Untitled",
    createdAt: old?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    width: scene.settings.video.width,
    height: scene.settings.video.height,
    steps: scene.steps.length,
    durationMs: resolveTimeline(scene).totalMs,
    ...(thumb ? { thumb } : {}),
    fileName,
  };
}

/** Save a scene to its entry (a new entry if the ID is new). */
export async function saveToLibrary(id: string, scene: Scene, assets: AssetStore | null, fileName: string | null): Promise<void> {
  await idbSet(sceneKey(id), sceneToJson(scene));
  if (assets) await idbSet(assetsKey(id), new Map([...assets].filter(([a]) => a in scene.assets)));
  const list = (await idbGet<LibraryEntry[]>(LIST).catch(() => undefined)) ?? [];
  const i = list.findIndex((e) => e.id === id);
  const entry = entryFor(id, scene, fileName, list[i]);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  await writeList(list);
}

/** Read a scene and its assets. */
export async function readFromLibrary(id: string): Promise<{ scene: Scene; assets: AssetStore; entry: LibraryEntry }> {
  const entry = (await listScenes()).find((e) => e.id === id);
  const json = await idbGet<string>(sceneKey(id));
  if (!entry || !json) throw new Error("This scene is not in the library any more.");
  const r = unpack(new TextEncoder().encode(json));
  if (!r.ok) throw new Error(`The scene '${entry.title}' is not valid. ${r.issues[0]?.message ?? ""}`.trim());
  const stored = (await idbGet<AssetStore>(assetsKey(id)).catch(() => undefined)) ?? new Map<string, Uint8Array>();
  return { scene: r.scene, assets: new Map([...stored].filter(([a]) => a in r.scene.assets)), entry };
}

export async function deleteFromLibrary(id: string): Promise<void> {
  await writeList(((await idbGet<LibraryEntry[]>(LIST)) ?? []).filter((e) => e.id !== id));
  await idbDelete(sceneKey(id));
  await idbDelete(assetsKey(id));
  if (useEditor.getState().libraryId === id) useEditor.setState({ libraryId: null });
}

export async function renameInLibrary(id: string, title: string): Promise<void> {
  const st = useEditor.getState();
  if (st.libraryId === id) {
    // The open scene: the change goes through the bus, and the autosave writes it.
    st.apply({ label: "Rename scene", ops: [{ op: "scene.meta", set: { title } }] });
    await flushAutosave();
    return;
  }
  const { scene, entry } = await readFromLibrary(id);
  await saveToLibrary(id, { ...scene, meta: { ...scene.meta, title } }, null, entry.fileName);
}

export async function duplicateInLibrary(id: string): Promise<string> {
  const { scene, assets } = await readFromLibrary(id);
  const copy = newLibraryId();
  await saveToLibrary(copy, { ...scene, meta: { ...scene.meta, title: `${scene.meta.title} (copy)` } }, assets, null);
  return copy;
}

/** The scene as an .anivo file. */
export async function libraryFileBytes(id: string): Promise<{ name: string; bytes: Uint8Array }> {
  const { scene, assets, entry } = await readFromLibrary(id);
  const base = entry.title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "scene";
  return { name: `${base}.anivo`, bytes: packArchive(scene, assets) };
}

// --- autosave of the open scene --------------------------------------------------

let timer = 0;

/** Save the open scene now (for example before the home screen opens). */
export async function flushAutosave(): Promise<void> {
  clearTimeout(timer);
  const st = useEditor.getState();
  if (!st.libraryId) return;
  await saveToLibrary(st.libraryId, st.scene, st.assets, st.fileName);
}

/** Save the open scene to the library 1 second after the last change. */
export function startLibraryAutosave(): () => void {
  return useEditor.subscribe((s, prev) => {
    if (!s.libraryId) return;
    const changed = s.scene !== prev.scene || s.assets !== prev.assets || s.fileName !== prev.fileName;
    // Opening a scene changes the ID with the scene: the first save waits for an edit.
    if (!changed || s.libraryId !== prev.libraryId) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => void flushAutosave(), 1000);
  });
}

/**
 * The library from an older version: the single autosave becomes the first
 * entry. Runs one time.
 */
export async function migrateAutosave(): Promise<void> {
  if ((await idbGet<LibraryEntry[]>(LIST).catch(() => undefined)) !== undefined) return;
  const saved = await idbGet<{ json: string; fileName: string | null }>("autosave").catch(() => undefined);
  if (!saved) {
    await idbSet(LIST, []);
    return;
  }
  const r = unpack(new TextEncoder().encode(saved.json));
  const assets = (await idbGet<AssetStore>("autosave-assets").catch(() => undefined)) ?? new Map<string, Uint8Array>();
  if (r.ok) await saveToLibrary(newLibraryId(), r.scene, assets, saved.fileName);
  else await idbSet(LIST, []);
}
