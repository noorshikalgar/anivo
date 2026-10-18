/**
 * Tools of the AI panel (FR-AGENT-10, docs/09 "AI panel"): the same tools as the
 * MCP server, run in the editor on the live scene. Changes go through the
 * operation bus with the author "AI panel", so the user can undo them.
 */
import { renderPngWeb } from "@anivo/export-web";
import { lintScene, formatLint, lintSummary } from "@anivo/lint";
import type { OperationInput } from "@anivo/ops";
import { searchIcons } from "@anivo/render";
import { compile, printScene } from "@anivo/script";
import { resolveTimeline } from "@anivo/engine";
import { sceneSummary } from "@anivo/tools/summary";
import * as z from "zod";
import { useEditor } from "../store.js";

export interface ToolOutput {
  text: string;
  /** A PNG image as base64, for providers that take images. */
  image?: string;
  error?: boolean;
}

export interface AiTool {
  name: string;
  description: string;
  schema: z.ZodType;
  run(input: never): Promise<ToolOutput>;
}

const AUTHOR = { kind: "agent" as const, name: "AI panel" };

function lintText(): string {
  const scene = useEditor.getState().scene;
  const results = lintScene(scene);
  const s = lintSummary(results);
  const shown = results.filter((r) => r.level !== "info").slice(0, 8);
  return `Lint: ${s.errors} errors, ${s.warnings} warnings, ${s.infos} notes.${shown.length ? `\n${formatLint(shown)}` : ""}`;
}

function apply(label: string, ops: OperationInput[]): ToolOutput {
  const st = useEditor.getState();
  const before = st.scene;
  const r = st.bus.apply({ label, ops, author: AUTHOR });
  if (!r.ok) return { text: `Error: ${r.error.message}${r.error.path ? ` (at ${r.error.path})` : ""}${r.error.hint ? `\n${r.error.hint}` : ""}`, error: true };
  const after = useEditor.getState().scene;
  const ids = Object.keys(after.elements).filter((id) => before.elements[id] !== after.elements[id]);
  useEditor.setState({ aiActivity: { ids, at: performance.now() } });
  return { text: `Applied ${ops.length} operations.${r.created.length ? ` New IDs: ${r.created.join(", ")}.` : ""}\n${lintText()}` };
}

const tool = <S extends z.ZodType>(name: string, description: string, schema: S, run: (input: z.infer<S>) => Promise<ToolOutput>): AiTool => ({ name, description, schema, run: run as AiTool["run"] });

export const AI_TOOLS: AiTool[] = [
  tool("scene_summary", "A compact outline of the scene: element IDs, types, labels, positions, and steps with actions.", z.object({}), async () => ({ text: sceneSummary(useEditor.getState().scene) })),
  tool("scene_get", "The full scene as Anivo Script.", z.object({}), async () => ({ text: printScene(useEditor.getState().scene) })),
  tool(
    "script_apply",
    "Change the scene with Anivo Script. append (default): add elements and steps. replace: the script is the full diagram and steps (audio stays). The result has a lint summary.",
    z.object({ script: z.string(), mode: z.enum(["append", "replace"]).default("append") }),
    async ({ script, mode }) => {
      const base = useEditor.getState().scene;
      const c = compile(script, { mode, base });
      if (!c.ok) return { text: `The script has errors:\n${c.errors.map((e) => `line ${e.line}, column ${e.col}: ${e.message}${e.hint ? ` ${e.hint}` : ""}`).join("\n")}`, error: true };
      const clear: OperationInput[] =
        mode === "replace" ? [...base.steps.map((s) => ({ op: "step.remove" as const, id: s.id })), ...(Object.keys(base.elements).length ? [{ op: "element.remove" as const, ids: Object.keys(base.elements) }] : [])] : [];
      return apply(mode === "replace" ? "AI: replace the scene" : "AI: add to the scene", [...clear, ...c.ops]);
    },
  ),
  tool(
    "ops_apply",
    "Change the scene with operations (element.add, element.update, element.place, step.add, action.add, and more). All apply, or none.",
    z.object({ label: z.string().optional(), ops: z.array(z.record(z.string(), z.unknown())) }),
    async ({ label, ops }) => apply(label ?? "AI change", ops as OperationInput[]),
  ),
  tool("lint", "Check layout and timing. Each problem has a fix hint.", z.object({}), async () => ({ text: formatLint(lintScene(useEditor.getState().scene)) || "No problems." })),
  tool(
    "preview",
    "A PNG image of the end of a step (0 is the base state; default: the last step).",
    z.object({ step: z.number().int().min(0).optional() }),
    async ({ step }) => {
      const { scene, assets } = useEditor.getState();
      const tl = resolveTimeline(scene);
      const n = step ?? tl.steps.length;
      const s = tl.steps[n - 1];
      const t = n <= 0 || !s ? -1 : Math.max(s.startMs, s.holdEndMs - 1);
      const blob = await renderPngWeb(scene, t, 960, Math.round((960 * scene.settings.video.height) / scene.settings.video.width), undefined, assets);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { text: `Step ${n} of ${tl.steps.length}.`, image: btoa(bin) };
    },
  ),
  tool("undo", "Undo the last change.", z.object({}), async () => (useEditor.getState().undo(), { text: "Undid the last change." })),
  tool("icons_search", "Search icon names. Use the result as pack:name in Anivo Script.", z.object({ query: z.string() }), async ({ query }) => ({ text: searchIcons(query, { limit: 12 }).map((r) => `${r.pack}:${r.name}`).join("\n") || "No icons match." })),
];

/** JSON Schema of a tool input (for the providers). */
export function inputSchema(t: AiTool): Record<string, unknown> {
  const s = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
  delete s["$schema"];
  return s;
}

/** Run a tool call from a model. The input is checked against the schema first. */
export async function runTool(name: string, input: unknown): Promise<ToolOutput> {
  const t = AI_TOOLS.find((x) => x.name === name);
  if (!t) return { text: `Error: the tool '${name}' does not exist.`, error: true };
  const parsed = t.schema.safeParse(input ?? {});
  if (!parsed.success) return { text: `Error: the input is not valid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, error: true };
  try {
    return await t.run(parsed.data as never);
  } catch (err) {
    return { text: `Error: ${err instanceof Error ? err.message : String(err)}`, error: true };
  }
}
