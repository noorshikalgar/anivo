import { z } from "zod";
import { Element } from "./elements.js";
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
 * 3. Apply the visibility rule (docs/06): an element whose first action is
 *    `enter` is not visible in the base state.
 * 4. Check that all references point to existing elements.
 */
export function loadScene(input: unknown): LoadResult {
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
  };

  const refIssues = checkReferences(scene);
  if (refIssues.length > 0) return { ok: false, issues: refIssues };

  applyVisibilityRule(scene);
  return { ok: true, scene, readOnly, warnings: [] };
}

function checkReferences(scene: Scene): SchemaIssue[] {
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

/** Set `visible: false` for each element whose first action is `enter`. Mutates the scene. */
function applyVisibilityRule(scene: Scene): void {
  const seen = new Set<string>();
  for (const step of scene.steps) {
    for (const action of step.actions) {
      for (const id of action.targets) {
        if (seen.has(id)) continue;
        seen.add(id);
        const el = scene.elements[id];
        if (el && action.type === "enter") el.visible = false;
      }
    }
  }
}
