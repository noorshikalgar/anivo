import * as z from "zod";
import { Element } from "./elements.js";
import { type RawScene, migrate } from "./migrate.js";
import { SCHEMA_VERSION, type Scene, SceneFile } from "./scene.js";

export interface SchemaIssue {
  /** Path to the problem, for example `elements.lb.width`. */
  path: string;
  message: string;
}

export type LoadResult =
  | { ok: true; scene: Scene; readOnly: boolean; warnings: SchemaIssue[] }
  | { ok: false; issues: SchemaIssue[] };

function toIssues(error: z.ZodError, prefix = ""): SchemaIssue[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }));
}

/**
 * Load a scene from unknown input (parsed JSON).
 *
 * 1. Validate the file shape.
 * 2. Fill each element ID from its map key.
 * 3. Check that all references point to existing elements.
 *
 * The visibility rule (docs/06) is applied by the engine, not here, so it
 * stays correct when operations add or remove actions.
 */
export function loadScene(input: unknown): LoadResult {
  if (input && typeof input === "object" && typeof (input as { schemaVersion?: unknown }).schemaVersion === "number") {
    try {
      input = migrate(input as RawScene, SCHEMA_VERSION);
    } catch (err) {
      return { ok: false, issues: [{ path: "schemaVersion", message: err instanceof Error ? err.message : String(err) }] };
    }
  }
  const file = SceneFile.safeParse(input);
  if (!file.success) return { ok: false, issues: toIssues(file.error) };

  const raw = file.data;
  // A newer file opens read-only (docs/05 "Schema versions and migrations").
  const readOnly = raw.schemaVersion > SCHEMA_VERSION;

  const issues: SchemaIssue[] = [];
  const elements: Scene["elements"] = {};
  for (const [key, value] of Object.entries(raw.elements)) {
    if (value.id !== undefined && value.id !== key) {
      issues.push({ path: `elements.${key}.id`, message: `The ID '${String(value.id)}' does not match the key '${key}'. Remove the 'id' field or make it equal to the key.` });
      continue;
    }
    const parsed = Element.safeParse({ ...value, id: key });
    if (parsed.success) elements[key] = parsed.data;
    else issues.push(...toIssues(parsed.error, `elements.${key}`));
  }
  if (issues.length > 0) return { ok: false, issues };

  const scene: Scene = {
    schemaVersion: SCHEMA_VERSION,
    id: raw.id,
    meta: raw.meta,
    settings: raw.settings,
    elements,
    steps: raw.steps,
    audio: raw.audio,
    script: raw.script,
    assets: raw.assets,
    comments: raw.comments,
  };

  const refIssues = checkReferences(scene);
  if (refIssues.length > 0) return { ok: false, issues: refIssues };

  return { ok: true, scene, readOnly, warnings: [] };
}

/** Check that all references in a scene point to existing elements, and that IDs are unique. */
export function checkReferences(scene: Scene): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const has = (id: string) => id in scene.elements;
  const known = () => Object.keys(scene.elements).slice(0, 20).join(", ");

  for (const el of Object.values(scene.elements)) {
    if (el.parentId !== undefined && !has(el.parentId)) {
      issues.push({ path: `elements.${el.id}.parentId`, message: `The parent '${el.parentId}' does not exist.` });
    }
    if (el.type === "connector") {
      for (const end of ["start", "end"] as const) {
        const e = el[end];
        if (e.kind === "bound" && !has(e.elementId)) {
          issues.push({ path: `elements.${el.id}.${end}.elementId`, message: `The element '${e.elementId}' does not exist. Use one of: ${known()}.` });
        }
      }
    }
  }

  // Images refer to image assets.
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "image") continue;
    const a = scene.assets[el.assetId];
    if (!a) issues.push({ path: `elements.${el.id}.assetId`, message: `The asset '${el.assetId}' does not exist.` });
    else if (!a.mime.startsWith("image/")) issues.push({ path: `elements.${el.id}.assetId`, message: `The asset '${el.assetId}' is not an image (${a.mime}).` });
  }

  // Audio tracks refer to assets, and cue triggers refer to audio tracks.
  const trackIds = new Set<string>();
  scene.audio.forEach((t, ti) => {
    if (trackIds.has(t.id)) issues.push({ path: `audio.${ti}.id`, message: `The audio track ID '${t.id}' is used two times.` });
    trackIds.add(t.id);
    if (!(t.assetId in scene.assets)) issues.push({ path: `audio.${ti}.assetId`, message: `The asset '${t.assetId}' does not exist.`, });
  });
  if (scene.audio.filter((t) => t.kind === "voiceover").length > 1) issues.push({ path: "audio", message: "A scene can have one voiceover track only." });
  scene.steps.forEach((step, si) => {
    if (step.trigger.kind === "cue" && !trackIds.has(step.trigger.audioId)) issues.push({ path: `steps.${si}.trigger.audioId`, message: `The audio track '${step.trigger.audioId}' does not exist.` });
  });
  scene.script.forEach((l, li) => {
    if (l.stepId !== undefined && !scene.steps.some((s) => s.id === l.stepId)) issues.push({ path: `script.${li}.stepId`, message: `The step '${l.stepId}' does not exist.` });
  });

  const stepIds = new Set<string>();
  const actionIds = new Set<string>();
  scene.steps.forEach((step, si) => {
    if (stepIds.has(step.id)) issues.push({ path: `steps.${si}.id`, message: `The step ID '${step.id}' is used two times. Each step ID must be unique.` });
    stepIds.add(step.id);
    step.actions.forEach((action, ai) => {
      if (actionIds.has(action.id)) issues.push({ path: `steps.${si}.actions.${ai}.id`, message: `The action ID '${action.id}' is used two times. Each action ID must be unique.` });
      actionIds.add(action.id);
      action.targets.forEach((t, ti) => {
        if (!has(t)) issues.push({ path: `steps.${si}.actions.${ai}.targets.${ti}`, message: `The element '${t}' does not exist. Use one of: ${known()}.` });
      });
      if (action.type === "flow") {
        for (const t of action.targets) {
          const el = scene.elements[t];
          if (el && el.type !== "connector") issues.push({ path: `steps.${si}.actions.${ai}.targets`, message: `A flow target must be a connector. '${t}' is a ${el.type}.` });
        }
      }
    });
  });
  return issues;
}
