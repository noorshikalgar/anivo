import type { LoadResult, Scene } from "@anivo/schema";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { MAX_ARCHIVE_BYTES, sceneFromJson, sceneToJson } from "./serialize.js";

/** The bytes of the scene assets, keyed by asset ID. The scene keeps only the references. */
export type AssetStore = Map<string, Uint8Array>;

/**
 * Content ID of a file: a 64-bit FNV-1a hash as 16 hex characters. It is
 * synchronous and the same everywhere. It removes duplicate files; it is
 * not a security hash.
 */
export function assetId(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i]!, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ bytes[i]! ^ (i & 0xff), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const toBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Only the assets that the scene uses. */
function used(scene: Scene, assets: AssetStore): [string, Uint8Array][] {
  return Object.keys(scene.assets).flatMap((id) => {
    const b = assets.get(id);
    return b ? [[id, b] as [string, Uint8Array]] : [];
  });
}

/** `.anivo` archive: scene.json and assets/<id> (docs/05 "File formats"). */
export function packArchive(scene: Scene, assets: AssetStore = new Map()): Uint8Array {
  const files: Record<string, Uint8Array> = { "scene.json": strToU8(sceneToJson(scene)) };
  for (const [id, b] of used(scene, assets)) files[`assets/${id}`] = b;
  return zipSync(files, { level: 6, mtime: new Date(Date.UTC(2020, 0, 1)) });
}

/** Single JSON file: the scene plus "assetData" with base64 bytes. */
export function packJson(scene: Scene, assets: AssetStore = new Map()): string {
  const list = used(scene, assets);
  if (list.length === 0) return sceneToJson(scene);
  const json = JSON.parse(sceneToJson(scene)) as Record<string, unknown>;
  json["assetData"] = Object.fromEntries(list.map(([id, b]) => [id, toBase64(b)]));
  return `${JSON.stringify(json, null, 2)}\n`;
}

export type UnpackResult = (LoadResult & { ok: true; assets: AssetStore }) | (LoadResult & { ok: false });

/** Read a ZIP archive or a JSON file, with its assets. */
export function unpack(bytes: Uint8Array): UnpackResult {
  const assets: AssetStore = new Map();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let files: Record<string, Uint8Array>;
    try {
      let total = 0;
      files = unzipSync(bytes, {
        filter: (f) => {
          total += f.originalSize;
          if (total > MAX_ARCHIVE_BYTES) throw new Error("The archive is larger than 200 MB when uncompressed.");
          return f.name === "scene.json" || /^assets\/[0-9a-f]{16}$/.test(f.name);
        },
      });
    } catch (err) {
      return { ok: false, issues: [{ path: "", message: `The file is not a valid Anivo archive. ${err instanceof Error ? err.message : ""}`.trim() }] };
    }
    const json = files["scene.json"];
    if (!json) return { ok: false, issues: [{ path: "", message: "The archive has no scene.json file." }] };
    for (const [name, b] of Object.entries(files)) if (name.startsWith("assets/")) assets.set(name.slice(7), b);
    const r = sceneFromJson(strFromU8(json));
    return r.ok ? { ...r, assets } : r;
  }
  const text = strFromU8(bytes);
  const r = sceneFromJson(text);
  if (!r.ok) return r;
  try {
    const data = (JSON.parse(text) as { assetData?: Record<string, string> }).assetData ?? {};
    for (const [id, b64] of Object.entries(data)) assets.set(id, fromBase64(b64));
  } catch {
    // sceneFromJson already parsed the text.
  }
  return { ...r, assets };
}
