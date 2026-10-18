import { Action, Element, type LoadResult, type Scene, SceneMeta, SceneSettings, Step, loadScene } from "@anivo/schema";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Remove the keys whose value equals the default value. */
function withoutDefaults(value: Record<string, unknown>, defaults: Record<string, unknown>, keep: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (!keep.includes(k) && k in defaults && deepEqual(v, defaults[k])) continue;
    out[k] = v;
  }
  return out;
}

/** Sort object keys at all levels, so the same scene always gives the same text (docs/05). */
function sortKeys(v: unknown): Json {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v as Json;
}

const elementDefaults = new Map<string, Record<string, unknown>>();
function defaultsForElement(el: Element): Record<string, unknown> {
  let d = elementDefaults.get(el.type);
  if (!d) {
    // Parse a minimal element of the same type to get the schema defaults.
    const minimal: Record<string, unknown> = { id: "x", z: "a", type: el.type };
    if (el.type === "text") minimal["content"] = { text: "" };
    if (el.type === "icon") Object.assign(minimal, { pack: "p", name: "n" });
    if (el.type === "connector") Object.assign(minimal, { start: { kind: "free", x: 0, y: 0 }, end: { kind: "free", x: 0, y: 0 } });
    if (el.type === "code") minimal["code"] = "";
    if (el.type === "image") minimal["assetId"] = "0000000000000000";
    d = Element.parse(minimal) as Record<string, unknown>;
    elementDefaults.set(el.type, d);
  }
  return d;
}

function compactElement(el: Element): Record<string, unknown> {
  // Required fields stay, even when they equal the value of the minimal element.
  const out = withoutDefaults(el as Record<string, unknown>, defaultsForElement(el), ["type", "z", "content", "pack", "name", "start", "end", "code", "assetId"]);
  delete out["id"]; // the map key is the ID
  if (el.type === "connector") {
    // Connector bounds are derived (docs/05).
    for (const k of ["x", "y", "width", "height"]) delete out[k];
    for (const end of ["start", "end"] as const) {
      const e = el[end];
      if (e.kind === "bound") out[end] = withoutDefaults(e as Record<string, unknown>, { side: "auto", offset: 0 });
    }
  }
  return out;
}

function compactAction(a: Action): Record<string, unknown> {
  // The minimal action has the required fields of its type. Their sub-objects keep their defaults.
  const minimal: Record<string, unknown> = { id: a.id, type: a.type, targets: a.targets };
  if (a.type === "enter" || a.type === "exit" || a.type === "emphasis") minimal["effect"] = a.effect;
  if (a.type === "morph") minimal["to"] = a.to;
  if (a.type === "camera") minimal["camera"] = { op: a.camera.op };
  if (a.type === "counter") minimal["counter"] = { from: a.counter.from, to: a.counter.to };
  if (a.type === "code") minimal["code"] = a.code;
  const defaults = Action.parse(minimal) as Record<string, unknown>;
  const out = withoutDefaults(a as Record<string, unknown>, defaults, ["id", "type", "targets", "effect", "to", "code"]);
  if (a.type === "camera") out["camera"] = { op: a.camera.op, ...withoutDefaults(a.camera as Record<string, unknown>, defaults["camera"] as Record<string, unknown>) };
  if (a.type === "counter") out["counter"] = { from: a.counter.from, to: a.counter.to, ...withoutDefaults(a.counter as Record<string, unknown>, defaults["counter"] as Record<string, unknown>) };
  if (a.type === "flow" && out["flow"]) out["flow"] = withoutDefaults(a.flow as Record<string, unknown>, defaults["flow"] as Record<string, unknown>);
  return out;
}

function compactStep(s: Step): Record<string, unknown> {
  const defaults = Step.parse({ id: s.id }) as Record<string, unknown>;
  const out = withoutDefaults(s as Record<string, unknown>, defaults, ["id"]);
  if (s.actions.length > 0) out["actions"] = s.actions.map(compactAction);
  return out;
}

/** The scene as a plain object with default values removed. */
export function compactScene(scene: Scene): Record<string, unknown> {
  const elements: Record<string, unknown> = {};
  const sorted = Object.values(scene.elements).sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const el of sorted) elements[el.id] = compactElement(el);
  const settingsDefaults = SceneSettings.parse({}) as Record<string, unknown>;
  const settings: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(scene.settings)) {
    if (v === undefined) continue;
    const d = settingsDefaults[k];
    if (v && typeof v === "object" && d && typeof d === "object") {
      const sub = withoutDefaults(v as Record<string, unknown>, d as Record<string, unknown>);
      if (Object.keys(sub).length > 0) settings[k] = sub;
    } else if (!deepEqual(v, d)) settings[k] = v;
  }
  const meta = withoutDefaults(scene.meta as Record<string, unknown>, SceneMeta.parse({}) as Record<string, unknown>, ["title"]);
  const out: Record<string, unknown> = { schemaVersion: scene.schemaVersion, id: scene.id, meta, settings, elements, steps: scene.steps.map(compactStep) };
  if (scene.audio.length) out["audio"] = scene.audio;
  if (scene.script.length) out["script"] = scene.script;
  if (Object.keys(scene.assets).length) out["assets"] = scene.assets;
  return out;
}

/**
 * Scene to JSON text: defaults removed, stable key order, 2-space indent.
 * Elements keep their draw order (by z, then ID) in the map, so a change of
 * one label changes one line (FR-FILE-02).
 */
export function sceneToJson(scene: Scene): string {
  const compact = compactScene(scene);
  const { elements, steps, audio, script, assets, ...rest } = compact;
  // Keep the element map in draw order. Sort keys inside each element only.
  const sortedElements: Record<string, Json> = {};
  for (const [id, el] of Object.entries(elements as Record<string, unknown>)) sortedElements[id] = sortKeys(el);
  const top = sortKeys(rest) as Record<string, Json>;
  const ordered: Record<string, Json> = { schemaVersion: top["schemaVersion"]!, id: top["id"]!, meta: top["meta"]!, settings: top["settings"]!, elements: sortedElements, steps: sortKeys(steps) };
  if (audio) ordered["audio"] = sortKeys(audio);
  if (script) ordered["script"] = sortKeys(script);
  if (assets) ordered["assets"] = sortKeys(assets);
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Parse scene JSON text. */
export function sceneFromJson(text: string): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, issues: [{ path: "", message: `The file is not valid JSON. ${err instanceof Error ? err.message : ""}`.trim() }] };
  }
  return loadScene(data);
}

/** `.anivo` archive (ZIP): scene.json now; assets/ and audio/ later (docs/05 "File formats"). */
export function sceneToArchive(scene: Scene): Uint8Array {
  return zipSync({ "scene.json": strToU8(sceneToJson(scene)) }, { level: 6, mtime: new Date(Date.UTC(2020, 0, 1)) });
}

/** Maximum uncompressed size of an archive (docs/12 threat model). */
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

export function sceneFromArchive(bytes: Uint8Array): LoadResult {
  let files: Record<string, Uint8Array>;
  try {
    let total = 0;
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_ARCHIVE_BYTES) throw new Error("The archive is larger than 200 MB when uncompressed.");
        return f.name === "scene.json";
      },
    });
  } catch (err) {
    return { ok: false, issues: [{ path: "", message: `The file is not a valid Anivo archive. ${err instanceof Error ? err.message : ""}`.trim() }] };
  }
  const json = files["scene.json"];
  if (!json) return { ok: false, issues: [{ path: "", message: "The archive has no scene.json file." }] };
  return sceneFromJson(strFromU8(json));
}

/** Detect the format from the first bytes: a ZIP starts with "PK". */
export function sceneFromBytes(bytes: Uint8Array): LoadResult {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return sceneFromArchive(bytes);
  return sceneFromJson(strFromU8(bytes));
}
