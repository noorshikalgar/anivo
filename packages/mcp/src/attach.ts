/**
 * MCP server in attach mode (docs/09 "Bridge"): the tools change the scene that
 * the user sees in the web editor, through the bridge. Reads, previews, and lint
 * use a copy of the live scene; changes go to the editor's operation bus.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { resolveTimeline } from "@anivo/engine";
import { exportVideo, homePath, registerBundledAssets } from "@anivo/export-node";
import { formatLint, lintScene, lintSummary } from "@anivo/lint";
import type { OperationInput } from "@anivo/ops";
import { searchIcons } from "@anivo/render";
import { type Scene, loadScene } from "@anivo/schema";
import { compile, printScene } from "@anivo/script";
import { ToolError, assetCache, contactSheetPng, jsonSchema, previewPng, sceneSummary } from "@anivo/tools";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { type Bridge, type BridgeOptions, startBridge } from "./bridge.js";

/** Answer of the editor to an "apply" request. */
export type LiveApplyResult =
  | { ok: true; version: number; created: string[]; warnings: string[]; pending?: boolean }
  | { ok: false; error: { message: string; path?: string; hint?: string } };

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const text = (t: string): { content: Content[] } => ({ content: [{ type: "text", text: t }] });
const fail = (t: string, hint?: string) => ({ content: [{ type: "text" as const, text: `Error: ${t}${hint ? `\n${hint}` : ""}` }], isError: true });

function guideText(): string {
  const md = readFileSync(homePath("prompts", "scene-agent.md"), "utf8");
  const start = md.indexOf("## 1. Role");
  return start >= 0 ? md.slice(start) : md;
}

export function createAttachServer(bridge: Bridge, opts: { root?: string; agent?: string } = {}): McpServer {
  registerBundledAssets();
  const root = resolve(opts.root ?? ".");
  const agent = opts.agent ?? "agent";

  /** A copy of the live scene. Asset bytes go to the asset cache, for previews and exports. */
  const live = async (assets = false): Promise<Scene> => {
    const r = await bridge.request<{ scene: unknown; assets?: Record<string, string> }>("scene", { assets });
    const loaded = loadScene(r.scene);
    if (!loaded.ok) throw new ToolError(`The editor sent a scene that is not valid: ${loaded.issues[0]?.message ?? ""}`);
    for (const [id, b64] of Object.entries(r.assets ?? {})) assetCache.set(id, new Uint8Array(Buffer.from(b64, "base64")));
    return loaded.scene;
  };

  const apply = async (label: string, ops: OperationInput[]): Promise<string> => {
    const r = await bridge.request<LiveApplyResult>("apply", { tx: { label, ops }, agent });
    if (!r.ok) throw new ToolError(`${r.error.message}${r.error.path ? ` (at ${r.error.path})` : ""}`, r.error.hint);
    const scene = await live();
    const s = lintSummary(lintScene(scene));
    const shown = lintScene(scene).filter((x) => x.level !== "info").slice(0, 8);
    return [
      r.pending ? "The change waits for the user's review in the editor. Continue; the user accepts or rejects it." : `Applied ${ops.length} operations.${r.created.length ? ` New IDs: ${r.created.join(", ")}.` : ""}`,
      `Lint: ${s.errors} errors, ${s.warnings} warnings, ${s.infos} notes.${shown.length ? `\n${formatLint(shown)}` : ""}`,
    ].join("\n");
  };

  const run = async <T extends object>(fn: () => Promise<T> | T) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ToolError) return fail(err.message, err.hint);
      return fail(err instanceof Error ? err.message : String(err));
    }
  };

  const inside = (p: string): string => {
    const abs = isAbsolute(p) ? p : resolve(root, p);
    if (abs !== root && !abs.startsWith(root + sep)) throw new ToolError(`The path '${p}' is outside the folder ${root}.`);
    return abs;
  };

  const server = new McpServer(
    { name: "anivo-live", version: "0.1.0" },
    { instructions: "Anivo makes explainer videos from diagrams. These tools change the scene that the user sees in the Anivo editor, live. Call anivo_bridge_status first: if no editor is connected, tell the user the pairing code. Then call anivo_guide." },
  );

  server.registerTool(
    "anivo_bridge_status",
    { title: "Editor connection", description: "Is the editor connected? If not, returns the pairing code that the user types in the editor (Connect agent).", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const s = bridge.status();
      return text(s.connected ? "The editor is connected." : s.code ? `No editor is connected. Ask the user: in the Anivo editor, click "Connect agent", and type port ${s.port} and code ${s.code}. The code expires in 5 minutes.` : "No editor is connected.");
    },
  );

  server.registerTool("anivo_guide", { title: "Read the guide", description: "The guide for making videos with Anivo: procedure, design rules, and the Anivo Script reference.", inputSchema: {}, annotations: { readOnlyHint: true } }, async () => text(guideText()));

  server.registerTool(
    "anivo_scene_summary",
    { title: "Scene summary", description: "A compact outline of the live scene: element IDs, types, labels, positions, and steps.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => run(async () => text(sceneSummary(await live()))),
  );

  server.registerTool(
    "anivo_scene_get",
    { title: "Get the scene", description: "The live scene as Anivo Script (default) or JSON.", inputSchema: { format: z.enum(["script", "json"]).default("script") }, annotations: { readOnlyHint: true } },
    async (a) => run(async () => {
      const scene = await live();
      return text(a.format === "json" ? JSON.stringify(scene, null, 2) : printScene(scene));
    }),
  );

  server.registerTool(
    "anivo_script_apply",
    {
      title: "Apply Anivo Script",
      description: "Change the live scene with Anivo Script. append (default): the script adds elements and steps. replace: the script is the full diagram and steps (audio and assets stay). The user sees the change.",
      inputSchema: { script: z.string(), mode: z.enum(["append", "replace"]).default("append") },
    },
    async (a) =>
      run(async () => {
        const base = await live();
        const c = compile(a.script, { mode: a.mode, base });
        if (!c.ok) return fail(`The script has errors:\n${c.errors.map((e) => `line ${e.line}, column ${e.col}: ${e.message}${e.hint ? ` ${e.hint}` : ""}`).join("\n")}`, "Fix the lines, then call anivo_script_apply again.");
        const clear: OperationInput[] =
          a.mode === "replace"
            ? [...base.steps.map((s) => ({ op: "step.remove" as const, id: s.id })), ...(Object.keys(base.elements).length ? [{ op: "element.remove" as const, ids: Object.keys(base.elements) }] : [])]
            : [];
        return text(await apply(a.mode === "replace" ? "Agent: replace the scene" : "Agent: add to the scene", [...clear, ...c.ops]));
      }),
  );

  server.registerTool(
    "anivo_ops_apply",
    {
      title: "Apply operations",
      description: "Change the live scene with an operation transaction. Call anivo_schema with kind 'ops' for the list. All operations apply, or none.",
      inputSchema: { transaction: z.record(z.string(), z.unknown()).describe("{ ops: [ ... ], label?: string }") },
    },
    async (a) => run(async () => text(await apply(String(a.transaction["label"] ?? "Agent change"), (a.transaction["ops"] as OperationInput[] | undefined) ?? []))),
  );

  server.registerTool(
    "anivo_undo",
    { title: "Undo", description: "Undo the last change in the editor.", inputSchema: {} },
    async () => run(async () => (await bridge.request("undo"), text("Undid the last change."))),
  );

  server.registerTool(
    "anivo_lint",
    { title: "Lint", description: "Check layout and timing of the live scene. Each problem has a fix hint.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => run(async () => text(formatLint(lintScene(await live())))),
  );

  server.registerTool(
    "anivo_preview",
    {
      title: "Preview a frame",
      description: "A PNG image of one step of the live scene. Use debug to see element IDs.",
      inputSchema: {
        step: z.union([z.number().int().min(0), z.string()]).optional(),
        at: z.union([z.enum(["end", "start"]), z.number()]).default("end"),
        debug: z.boolean().default(false),
        width: z.number().int().min(160).max(1280).default(960),
      },
      annotations: { readOnlyHint: true },
    },
    async (a) =>
      run(async () => {
        const png = previewPng(await live(true), { ...(a.step !== undefined ? { step: a.step } : {}), at: a.at, debug: a.debug, width: a.width });
        return { content: [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }] };
      }),
  );

  server.registerTool(
    "anivo_contact_sheet",
    { title: "Contact sheet", description: "One PNG with the end state of each step of the live scene.", inputSchema: { debug: z.boolean().default(false) }, annotations: { readOnlyHint: true } },
    async (a) =>
      run(async () => {
        const png = contactSheetPng(await live(true), { debug: a.debug });
        return { content: [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }] };
      }),
  );

  server.registerTool(
    "anivo_export",
    {
      title: "Export",
      description: "Export the live scene as a video file (mp4, webm, gif, or prores .mov) inside the server folder.",
      inputSchema: { out: z.string(), overwrite: z.boolean().default(false) },
    },
    async (a) =>
      run(async () => {
        const out = inside(a.out);
        if (existsSync(out) && !a.overwrite) throw new ToolError(`The file '${a.out}' exists already.`, "Use another path, or set overwrite to true.");
        const scene = await live(true);
        const format = out.endsWith(".webm") ? "webm" : out.endsWith(".gif") ? "gif" : out.endsWith(".mov") ? "prores" : "mp4";
        const r = await exportVideo(scene, { out, format, assets: assetCache });
        return text(`Exported ${relative(root, r.out)}: ${r.frames} frames, ${(resolveTimeline(scene).totalMs / 1000).toFixed(1)} s.`);
      }),
  );

  server.registerTool(
    "anivo_icons_search",
    { title: "Search icons", description: "Search icon names. Use the result as pack:name in Anivo Script.", inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).default(12) }, annotations: { readOnlyHint: true } },
    async (a) => text(searchIcons(a.query, { limit: a.limit }).map((r) => `${r.pack}:${r.name}`).join("\n") || "No icons match."),
  );

  server.registerTool(
    "anivo_schema",
    { title: "JSON Schema", description: "The JSON Schema of a scene or of an operation transaction.", inputSchema: { kind: z.enum(["scene", "ops"]).default("ops") }, annotations: { readOnlyHint: true } },
    async (a) => text(JSON.stringify(jsonSchema(a.kind))),
  );

  return server;
}

/** `anivo mcp --attach --web`: the bridge and the MCP server on standard input and output. */
export async function runAttachServer(opts: { root?: string; port?: number; origins?: string[] } = {}): Promise<void> {
  const bridgeOpts: BridgeOptions = { log: (l) => process.stderr.write(`anivo: ${l}\n`) };
  if (opts.port !== undefined) bridgeOpts.port = opts.port;
  if (opts.origins?.length) bridgeOpts.origins = opts.origins;
  const bridge = await startBridge(bridgeOpts);
  const server = createAttachServer(bridge, opts.root !== undefined ? { root: opts.root } : {});
  await server.connect(new StdioServerTransport());
}
