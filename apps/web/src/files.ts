import { importText } from "@anivo/import";
import { type AssetStore, packArchive, packJson, unpack } from "@anivo/fileio";
import { type Scene, loadScene } from "@anivo/schema";
import { loadTemplate } from "./assets.js";
import { idbGet, idbSet } from "./idb.js";
import { flushAutosave, newLibraryId, readFromLibrary } from "./library.js";
import { notify } from "./notify.js";
import { useEditor } from "./store.js";

/** File System Access API types (Chromium). Other browsers download and upload files. */
export interface FileHandle {
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
  const assets = useEditor.getState().assets;
  return name.endsWith(".json") ? new TextEncoder().encode(packJson(scene, assets)) : packArchive(scene, assets);
}

function fileNameFor(scene: Scene): string {
  const base = scene.meta.title.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "scene";
  return `${base}.anivo`;
}

export class FileError extends Error {}

interface Opened {
  scene: Scene;
  assets: AssetStore;
}

/** Open a scene in the editor. A scene that is not in the library gets a new entry. */
function openScene({ scene, assets }: Opened, name: string | null, handle: FileHandle | null, libraryId?: string): void {
  currentHandle = handle;
  useEditor.getState().openScene(scene, assets);
  useEditor.setState({ fileName: name, dirty: false, libraryId: libraryId ?? newLibraryId() });
  if (!libraryId) void flushAutosave();
}

/** Open a scene of the library. */
export async function openFromLibrary(id: string): Promise<void> {
  const { scene, assets, entry } = await readFromLibrary(id);
  // The file of the scene, if the user saved it on this computer.
  const handle = entry.fileName ? ((await recentFiles()).find((r) => r.name === entry.fileName)?.handle ?? null) : null;
  openScene({ scene, assets }, entry.fileName, handle, id);
}

/** Open an .anivo file that the user dropped. */
export async function openDroppedFile(file: File): Promise<void> {
  openScene(await readFile(file), file.name, null);
}

async function readFile(file: File): Promise<Opened> {
  const r = unpack(new Uint8Array(await file.arrayBuffer()));
  if (!r.ok) throw new FileError(`The file '${file.name}' is not a valid Anivo scene. ${r.issues[0]?.path ?? ""} ${r.issues[0]?.message ?? ""}`.trim());
  return { scene: r.scene, assets: r.assets };
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

/** Open a file that the system gives the installed app (File Handling, docs/11). */
export async function openHandle(handle: FileHandle): Promise<void> {
  openScene(await readFile(await handle.getFile()), handle.name, handle);
  await addRecent(handle);
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

/** Make a new scene from an Excalidraw file or Mermaid text (FR-FILE-05, FR-FILE-06). Returns the warnings, or null if the user cancelled. */
export async function importDiagram(): Promise<string[] | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".excalidraw,.json,.mmd,.mermaid,.md,.txt";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return null;
  let r: ReturnType<typeof importText>;
  try {
    r = importText(file.name, await file.text());
  } catch (err) {
    throw new FileError(err instanceof Error ? err.message : String(err));
  }
  openScene({ scene: r.scene, assets: r.assets }, null, null);
  return r.warnings;
}

/** Import, then tell the user what did not convert. */
export async function runImport(): Promise<void> {
  const warnings = await importDiagram();
  if (warnings === null) return;
  notify(warnings.length ? `Imported. ${warnings.length} parts did not convert: ${warnings.slice(0, 2).join(" ")}` : "Imported", warnings.length ? "info" : "success");
}

/** A blank scene. The default size is 1920 x 1080 (16:9). */
export function newScene(size?: { width: number; height: number }): void {
  // A new scene starts with the Studio theme: calm, one accent (docs/20 B4).
  const r = loadScene({ schemaVersion: 1, meta: { title: "Untitled" }, settings: { theme: "studio-dark", ...(size ? { video: size } : {}) } });
  if (r.ok) openScene({ scene: r.scene, assets: new Map() }, null, null);
}

export async function newFromTemplate(name: string): Promise<void> {
  openScene({ scene: await loadTemplate(name), assets: new Map() }, null, null);
}

// --- changes (FR-FILE-03: library.ts saves the scene) ---------------------------

/** Mark the scene as changed after an edit. */
export function startAutosave(): () => void {
  return useEditor.subscribe((s, prev) => {
    if (s.scene !== prev.scene && s.version !== prev.version) useEditor.setState({ dirty: true });
  });
}

/** `anivo serve`: open the scene in "?scene=<path>" from this server (same origin only). */
export async function openSceneFromQuery(): Promise<boolean> {
  const path = new URLSearchParams(location.search).get("scene");
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  const res = await fetch(path);
  if (!res.ok) throw new FileError(`The scene did not load (HTTP ${res.status}).`);
  const r = unpack(new Uint8Array(await res.arrayBuffer()));
  if (!r.ok) throw new FileError(`The scene is not valid. ${r.issues[0]?.message ?? ""}`.trim());
  const name = decodeURIComponent(res.headers.get("x-anivo-name") ?? "") || null;
  openScene({ scene: r.scene, assets: r.assets }, name, null);
  return true;
}

/** Save the open scene, then show the home screen. */
export async function goHome(): Promise<void> {
  const st = useEditor.getState();
  st.pause();
  if (st.takes || st.recording) return;
  await flushAutosave();
  useEditor.setState({ screen: "home", selection: [], selectedStep: null });
}

/** Open a scene from another source (a share link) in a new library entry. */
export function openAsNew(scene: Scene, assets: AssetStore): void {
  openScene({ scene, assets }, null, null);
}
