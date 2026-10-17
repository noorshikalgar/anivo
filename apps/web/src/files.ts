import { sceneFromBytes, sceneToArchive, sceneToJson } from "@anivo/fileio";
import { type Scene, loadScene } from "@anivo/schema";
import { loadTemplate } from "./assets.js";
import { idbGet, idbSet } from "./idb.js";
import { useEditor } from "./store.js";

/** File System Access API types (Chromium). Other browsers download and upload files. */
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
  queryPermission?(opts: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "readwrite" }): Promise<PermissionState>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (opts: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandle>;
};
const w = window as PickerWindow;
export const hasFileSystemAccess = typeof w.showOpenFilePicker === "function";

const PICKER_TYPES = [
  { description: "Anivo scene", accept: { "application/zip": [".anivo"] } },
  { description: "Anivo scene (JSON)", accept: { "application/json": [".json"] } },
];

let currentHandle: FileHandle | null = null;

interface RecentFile {
  name: string;
  handle: FileHandle;
  openedAt: number;
}

async function addRecent(handle: FileHandle): Promise<void> {
  const list = ((await idbGet<RecentFile[]>("recent")) ?? []).filter((r) => r.name !== handle.name);
  list.unshift({ name: handle.name, handle, openedAt: Date.now() });
  await idbSet("recent", list.slice(0, 8));
}

export async function recentFiles(): Promise<RecentFile[]> {
  return (await idbGet<RecentFile[]>("recent")) ?? [];
}

function bytesFor(scene: Scene, name: string): Uint8Array {
  return name.endsWith(".json") ? new TextEncoder().encode(sceneToJson(scene)) : sceneToArchive(scene);
}

function fileNameFor(scene: Scene): string {
  const base = scene.meta.title.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "scene";
  return `${base}.anivo`;
}

export class FileError extends Error {}

function openScene(scene: Scene, name: string | null, handle: FileHandle | null): void {
  currentHandle = handle;
  useEditor.getState().openScene(scene);
  useEditor.setState({ fileName: name, dirty: false });
}

async function readFile(file: File): Promise<Scene> {
  const r = sceneFromBytes(new Uint8Array(await file.arrayBuffer()));
  if (!r.ok) throw new FileError(`The file '${file.name}' is not a valid Anivo scene. ${r.issues[0]?.path ?? ""} ${r.issues[0]?.message ?? ""}`.trim());
  return r.scene;
}

/** Open a scene file. Returns false if the user cancelled. */
export async function openFile(): Promise<boolean> {
  if (hasFileSystemAccess) {
    let handles: FileHandle[];
    try {
      handles = await w.showOpenFilePicker!({ types: PICKER_TYPES, excludeAcceptAllOption: false, multiple: false });
    } catch {
      return false; // cancelled
    }
    const handle = handles[0]!;
    openScene(await readFile(await handle.getFile()), handle.name, handle);
    await addRecent(handle);
    return true;
  }
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".anivo,.json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return false;
  openScene(await readFile(file), file.name, null);
  return true;
}

export async function openRecent(r: RecentFile): Promise<void> {
  if (r.handle.requestPermission && (await r.handle.requestPermission({ mode: "readwrite" })) !== "granted") {
    throw new FileError(`Anivo has no permission to open '${r.name}'. Open the file again with Open.`);
  }
  openScene(await readFile(await r.handle.getFile()), r.handle.name, r.handle);
  await addRecent(r.handle);
}

async function writeHandle(handle: FileHandle, scene: Scene): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(bytesFor(scene, handle.name) as BlobPart);
  await writable.close();
}

function download(scene: Scene, name: string): void {
  const blob = new Blob([bytesFor(scene, name) as BlobPart], { type: name.endsWith(".json") ? "application/json" : "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Save as a new file. Returns false if the user cancelled. */
export async function saveFileAs(): Promise<boolean> {
  const scene = useEditor.getState().scene;
  const suggested = useEditor.getState().fileName ?? fileNameFor(scene);
  if (hasFileSystemAccess) {
    let handle: FileHandle;
    try {
      handle = await w.showSaveFilePicker!({ suggestedName: suggested, types: PICKER_TYPES });
    } catch {
      return false;
    }
    await writeHandle(handle, scene);
    currentHandle = handle;
    useEditor.setState({ fileName: handle.name, dirty: false });
    await addRecent(handle);
    return true;
  }
  download(scene, suggested);
  useEditor.setState({ fileName: suggested, dirty: false });
  return true;
}

/** Save to the open file, or ask for a file name. */
export async function saveFile(): Promise<boolean> {
  if (!currentHandle) return saveFileAs();
  await writeHandle(currentHandle, useEditor.getState().scene);
  useEditor.setState({ dirty: false });
  return true;
}

export function newScene(): void {
  const r = loadScene({ schemaVersion: 1, meta: { title: "Untitled" } });
  if (r.ok) openScene(r.scene, null, null);
}

export async function newFromTemplate(name: string): Promise<void> {
  openScene(await loadTemplate(name), null, null);
}

// --- autosave (FR-FILE-03) -----------------------------------------------------

interface Autosave {
  json: string;
  fileName: string | null;
  savedAt: number;
}

let timer = 0;

/** Save the scene to IndexedDB 1 second after the last change. */
export function startAutosave(): () => void {
  return useEditor.subscribe((s, prev) => {
    if (s.scene === prev.scene) return;
    if (s.version !== prev.version) useEditor.setState({ dirty: true });
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const st = useEditor.getState();
      void idbSet("autosave", { json: sceneToJson(st.scene), fileName: st.fileName, savedAt: Date.now() } satisfies Autosave);
      if (currentHandle) void idbSet("handle", currentHandle);
    }, 1000);
  });
}

/** Restore the last autosave. Returns false if there is none. */
export async function restoreAutosave(): Promise<boolean> {
  const saved = await idbGet<Autosave>("autosave").catch(() => undefined);
  if (!saved) return false;
  const r = sceneFromBytes(new TextEncoder().encode(saved.json));
  if (!r.ok) return false;
  const handle = (await idbGet<FileHandle>("handle").catch(() => undefined)) ?? null;
  openScene(r.scene, saved.fileName, handle && handle.name === saved.fileName ? handle : null);
  return true;
}
