import { type Author, OperationBus } from "@anivo/ops";
import { type Scene, loadScene } from "@anivo/schema";
import { compile } from "./compile.js";
import type { ScriptError } from "./syntax.js";

export type ApplyScriptResult = { ok: true; scene: Scene; created: string[] } | { ok: false; errors: ScriptError[] };

/**
 * Compile Anivo Script and apply it as one transaction.
 * - `replace`: the result is a new scene with the script content only.
 * - `append`: the script adds to `base`.
 */
export function applyScript(text: string, opts: { mode?: "replace" | "append"; base?: Scene; author?: Author } = {}): ApplyScriptResult {
  const mode = opts.mode ?? "replace";
  const c = compile(text, { mode, ...(opts.base ? { base: opts.base } : {}) });
  if (!c.ok) return { ok: false, errors: c.errors };
  let start = opts.base;
  if (mode === "replace" || !start) {
    const empty = loadScene({ schemaVersion: 1 });
    if (!empty.ok) throw new Error("The empty scene is not valid.");
    // The script replaces the diagram and the steps. Assets, audio, and the voiceover script stay.
    // The script lines start with no step links (the steps are new) and link again below.
    start = opts.base ? { ...empty.scene, assets: opts.base.assets, audio: opts.base.audio, script: opts.base.script.map((l) => ({ id: l.id, text: l.text })) } : empty.scene;
  }
  const bus = new OperationBus(start);
  const r = bus.apply({ author: opts.author ?? { kind: "agent" }, label: "Apply Anivo Script", ops: c.ops });
  if (!r.ok) return { ok: false, errors: [{ line: 1, col: 1, message: r.error.message, ...(r.error.hint ? { hint: r.error.hint } : {}) }] };
  // Script lines link again to the steps that still exist (same step ID). Other lines lose the link.
  const steps = new Set(bus.scene.steps.map((st) => st.id));
  const old = mode === "replace" ? (opts.base?.script ?? []) : [];
  if (old.some((l) => l.stepId !== undefined && steps.has(l.stepId))) {
    bus.apply({ label: "Link script lines", ops: [{ op: "script.set", lines: old.map((l) => (l.stepId !== undefined && !steps.has(l.stepId) ? { id: l.id, text: l.text } : l)) }] });
  }
  return { ok: true, scene: bus.scene, created: r.created };
}
