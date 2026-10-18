import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AssetStore, assetId, packArchive, packJson, sceneToJson, unpack } from "@anivo/fileio";
import { type Scene } from "@anivo/schema";
import { applyScript, printScene } from "@anivo/script";

export class ToolError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/**
 * Asset bytes of all scenes that this process read or imported, by asset ID.
 * IDs are content hashes, so one store serves all scenes. A write takes the
 * bytes of the assets that the scene uses from here.
 */
export const assetCache: AssetStore = new Map();

/** Add a file as an asset. Returns the asset reference for asset.add. */
export function importAsset(path: string, mime: string): { id: string; mime: string; bytes: number; name: string } {
  const bytes = new Uint8Array(readFileSync(path));
  const id = assetId(bytes);
  assetCache.set(id, bytes);
  return { id, mime, bytes: bytes.length, name: path.split(/[\\/]/).pop() ?? "file" };
}

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Read a scene from a file:
 * - `.anivo` archive (ZIP), or a folder `<name>.anivo/` with `scene.json` (FR-FILE-02)
 * - `.json` or `.anivo.json`
 * - `.anivo.txt` Anivo Script
 */
export function readSceneFile(path: string): Scene {
  if (isDir(path)) {
    const dir = join(path, "assets");
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (/^[0-9a-f]{16}$/.test(f)) assetCache.set(f, new Uint8Array(readFileSync(join(dir, f))));
    return readSceneFile(join(path, "scene.json"));
  }
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new ToolError(`The file '${path}' does not exist.`, "Check the path, or make a scene with 'anivo new'.");
  }
  if (path.endsWith(".txt")) {
    const r = applyScript(new TextDecoder().decode(bytes));
    if (!r.ok) throw new ToolError(`The script '${path}' has errors:\n${r.errors.map((e) => `  line ${e.line}, column ${e.col}: ${e.message}${e.hint ? ` ${e.hint}` : ""}`).join("\n")}`);
    return r.scene;
  }
  const r = unpack(bytes);
  if (!r.ok) throw new ToolError(`The file '${path}' is not a valid Anivo scene: ${r.issues.slice(0, 3).map((i) => `${i.path} ${i.message}`).join("; ")}`);
  for (const [id, b] of r.assets) assetCache.set(id, b);
  return r.scene;
}

/** Write a scene. The format comes from the path: folder, .anivo (ZIP), .json, or .txt (Anivo Script). */
export function writeSceneFile(path: string, scene: Scene): void {
  const missing = Object.keys(scene.assets).filter((id) => !assetCache.has(id));
  if (missing.length) throw new ToolError(`The bytes of asset ${missing[0]} are not available, so the file would be incomplete.`, "Open the scene from its original file, then save it again.");
  if (isDir(path) || path.endsWith("/")) {
    mkdirSync(join(path, "assets"), { recursive: true });
    writeFileSync(join(path, "scene.json"), sceneToJson(scene));
    for (const id of Object.keys(scene.assets)) writeFileSync(join(path, "assets", id), assetCache.get(id)!);
  } else if (path.endsWith(".txt")) writeFileSync(path, printScene(scene));
  else if (path.endsWith(".json")) writeFileSync(path, packJson(scene, assetCache));
  else writeFileSync(path, packArchive(scene, assetCache));
}
