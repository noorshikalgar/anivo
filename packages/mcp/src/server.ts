import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { resolveTimeline, sceneCaptions, toSrt, toVtt } from "@anivo/engine";
import { exportHtml, exportVideo, homePath, imageSize, registerBundledAssets, renderSvg } from "@anivo/export-node";
import { formatLint, lintScene, lintSummary } from "@anivo/lint";
import { type Composition, OperationBus, compositionOf, compositionSlots, insertCompositionOps } from "@anivo/ops";
import { searchIcons } from "@anivo/render";
import { type Scene, TEMPLATES, loadScene } from "@anivo/schema";
import { importText } from "@anivo/import";
import { applyScript, printScene } from "@anivo/script";
import { ToolError, assetCache, audioOnsets, contactSheetPng, imageMime, importAsset, transcribe, jsonSchema, previewPng, readSceneFile, sceneSummary, writeSceneFile } from "@anivo/tools";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface ServerOptions {
  /** Folder for scene files and exports. The server reads and writes only inside it. */
  root: string;
  name?: string;
}

const TEMPLATE_TITLES: Record<string, string> = Object.fromEntries(TEMPLATES.map((t) => [t.name, `${t.title}. ${t.description}`]));


/** The scene-agent guide: the prompt file without its header (docs/09 anivo_guide). */
function guideText(): string {
  const md = readFileSync(homePath("prompts", "scene-agent.md"), "utf8");
  const start = md.indexOf("## 1. Role");
  return start >= 0 ? md.slice(start) : md;
}

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const text = (t: string): { content: Content[] } => ({ content: [{ type: "text", text: t }] });
const fail = (t: string, hint?: string) => ({ content: [{ type: "text" as const, text: `Error: ${t}${hint ? `\n${hint}` : ""}` }], isError: true });

export function createAnivoServer(opts: ServerOptions): McpServer {
  registerBundledAssets();
  const root = realpathSync(resolve(opts.root));
  const history = new Map<string, Scene[]>();

  /**
   * Resolve a path inside the root (docs/09 "File access safety"). The check
   * uses real paths, so a symbolic link cannot point outside the root.
   */
  const inside = (p: string): string => {
    if (!p || p.includes("\0")) throw new ToolError("The path is empty or not valid.");
    const abs = isAbsolute(p) ? p : resolve(root, p);
    let real: string;
    if (existsSync(abs)) real = realpathSync(abs);
    else {
      const parent = dirname(abs);
      if (!existsSync(parent)) throw new ToolError(`The folder '${relative(root, parent) || "."}' does not exist.`, "Use a path in an existing folder under the root.");
      real = resolve(realpathSync(parent), abs.slice(parent.length + 1));
    }
    if (real !== root && !real.startsWith(root + sep)) throw new ToolError(`The path '${p}' is outside the scene folder.`, `Use a path inside ${root}.`);
    return real;
  };

  const sceneFile = (p: string) => {
    const path = inside(p);
    if (!/\.(anivo|json|txt)$/.test(path) && !(existsSync(path) && statSync(path).isDirectory())) {
      throw new ToolError(`The scene path '${p}' must end with .anivo, .json, or .anivo.txt.`);
    }
    return path;
  };

  const save = (path: string, before: Scene | undefined, scene: Scene) => {
    if (before) {
      const list = history.get(path) ?? [];
      list.push(before);
      if (list.length > 30) list.shift();
      history.set(path, list);
    }
    writeSceneFile(path, scene);
  };

  const lintReport = (scene: Scene, max = 8) => {
    const results = lintScene(scene);
    const s = lintSummary(results);
    const shown = results.filter((r) => r.level !== "info").slice(0, max);
    return `Lint: ${s.errors} errors, ${s.warnings} warnings, ${s.infos} notes.${shown.length ? `\n${formatLint(shown)}` : ""}`;
  };

  /** Run a tool body. ToolError becomes an error result with a hint. */
  const run = async <T extends object>(fn: () => Promise<T> | T) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ToolError) return fail(err.message, err.hint);
      return fail(err instanceof Error ? err.message : String(err));
    }
  };

  const server = new McpServer({ name: opts.name ?? "anivo", version: "0.1.0" }, { instructions: "Anivo makes explainer videos from diagrams. Call anivo_guide first. Write scenes in Anivo Script with anivo_script_apply, check them with anivo_lint and anivo_contact_sheet, then export with anivo_export." });
  const sceneArg = z.string().describe("Scene file path inside the scene folder, for example 'videos/auth.anivo'.");

  server.registerTool(
    "anivo_guide",
    { title: "Read the guide", description: "Return the guide for making videos with Anivo: procedure, design rules, and the Anivo Script reference. Call this first.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => text(guideText()),
  );

  server.registerTool(
    "anivo_templates_list",
    { title: "List templates", description: "List the built-in templates. Use a name with anivo_scene_create.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => text(Object.entries(TEMPLATE_TITLES).map(([k, v]) => `${k}: ${v}`).join("\n")),
  );

  server.registerTool(
    "anivo_scene_create",
    {
      title: "Create a scene",
      description: "Make a new scene file. Optionally start from a template. The file must not exist.",
      inputSchema: {
        path: sceneArg,
        title: z.string().optional().describe("Scene title."),
        template: z.enum(TEMPLATES.map((t) => t.name) as [string, ...string[]]).optional(),
        style: z.enum(["clean", "sketch"]).optional(),
        theme: z.enum(["slate-dark", "slate-light", "paper-light", "night-dark", "pop-light", "neon-dark", "studio-dark"]).optional(),
      },
    },
    async (a) =>
      run(() => {
        const path = sceneFile(a.path);
        if (existsSync(path)) throw new ToolError(`The file '${a.path}' exists already.`, "Use a new path, or change the scene with anivo_script_apply.");
        let scene: Scene;
        if (a.template) scene = readSceneFile(homePath("assets", "templates", `${a.template}.anivo.json`));
        else {
          const r = loadScene({ schemaVersion: 1, meta: { title: a.title ?? "Untitled" } });
          if (!r.ok) throw new Error("empty scene");
          scene = r.scene;
        }
        const bus = new OperationBus(scene);
        const settings: Record<string, unknown> = {};
        if (a.style) settings["style"] = a.style;
        if (a.theme) settings["theme"] = a.theme;
        if (Object.keys(settings).length) bus.apply({ ops: [{ op: "scene.settings", set: settings }] });
        if (a.title && a.template) bus.apply({ ops: [{ op: "scene.meta", set: { title: a.title } }] });
        save(path, undefined, bus.scene);
        return text(`Made ${relative(root, path)}.${a.template ? `\n\n${sceneSummary(bus.scene)}` : ""}`);
      }),
  );

  server.registerTool(
    "anivo_scene_summary",
    { title: "Scene summary", description: "Return a compact outline of a scene: element IDs, types, labels, positions, and steps with actions. Use it to see the scene before a change.", inputSchema: { scene: sceneArg }, annotations: { readOnlyHint: true } },
    async (a) => run(() => text(sceneSummary(readSceneFile(sceneFile(a.scene))))),
  );

  server.registerTool(
    "anivo_scene_get",
    {
      title: "Get the scene",
      description: "Return the full scene as Anivo Script (default) or JSON. Edit the script and send it back with anivo_script_apply in replace mode.",
      inputSchema: { scene: sceneArg, format: z.enum(["script", "json"]).default("script") },
      annotations: { readOnlyHint: true },
    },
    async (a) =>
      run(() => {
        const scene = readSceneFile(sceneFile(a.scene));
        return text(a.format === "json" ? JSON.stringify(scene, null, 2) : printScene(scene));
      }),
  );

  server.registerTool(
    "anivo_script_apply",
    {
      title: "Apply Anivo Script",
      description: "Write a scene with Anivo Script. replace: the script is the full scene (the file is made if it does not exist). append: the script adds elements and steps. The result has a lint summary.",
      inputSchema: { scene: sceneArg, script: z.string().describe("Anivo Script text. Call anivo_guide for the language reference."), mode: z.enum(["replace", "append"]).default("replace") },
    },
    async (a) =>
      run(() => {
        const path = sceneFile(a.scene);
        const before = existsSync(path) ? readSceneFile(path) : undefined;
        if (a.mode === "append" && !before) throw new ToolError(`The scene '${a.scene}' does not exist.`, "Use mode 'replace' to make it.");
        const r = applyScript(a.script, { mode: a.mode, ...(before ? { base: before } : {}), author: { kind: "agent" } });
        if (!r.ok) return fail(`The script has errors:\n${r.errors.map((e) => `line ${e.line}, column ${e.col}: ${e.message}${e.hint ? ` ${e.hint}` : ""}`).join("\n")}`, "Fix the lines, then call anivo_script_apply again.");
        save(path, before, r.scene);
        const tl = resolveTimeline(r.scene);
        return text(`Saved ${relative(root, path)}: ${Object.keys(r.scene.elements).length} elements, ${r.scene.steps.length} steps, ${(tl.totalMs / 1000).toFixed(1)} s.\n${lintReport(r.scene)}`);
      }),
  );

  server.registerTool(
    "anivo_ops_apply",
    {
      title: "Apply operations",
      description: "Change a scene with an operation transaction (element.add, element.update, element.place, step.add, action.add, and more). Call anivo_schema with kind 'ops' for the full list. All operations apply, or none.",
      inputSchema: { scene: sceneArg, transaction: z.record(z.string(), z.unknown()).describe("A transaction: { ops: [ ... ], label?: string, baseVersion?: number }.") },
    },
    async (a) =>
      run(() => {
        const path = sceneFile(a.scene);
        const before = readSceneFile(path);
        const bus = new OperationBus(before);
        const r = bus.apply({ ...a.transaction, author: { kind: "agent" } });
        if (!r.ok) return fail(`${r.error.message} (at ${r.error.path})`, r.error.hint);
        save(path, before, bus.scene);
        return text(`Applied ${(a.transaction["ops"] as unknown[] | undefined)?.length ?? 0} operations.${r.created.length ? ` New IDs: ${r.created.join(", ")}.` : ""}\n${lintReport(bus.scene)}`);
      }),
  );

  server.registerTool(
    "anivo_lint",
    { title: "Lint the scene", description: "Check layout and timing: overlaps, text overflow, elements off camera, low contrast, empty steps, and more. Each problem has a fix hint.", inputSchema: { scene: sceneArg }, annotations: { readOnlyHint: true } },
    async (a) => run(() => text(formatLint(lintScene(readSceneFile(sceneFile(a.scene)))))),
  );

  server.registerTool(
    "anivo_preview",
    {
      title: "Preview a frame",
      description: "Return a PNG image of one step. Use debug to see element IDs on the image.",
      inputSchema: {
        scene: sceneArg,
        step: z.union([z.number().int().min(0), z.string()]).optional().describe("Step number (0 is the base state) or step ID. Default: the last step."),
        at: z.union([z.enum(["end", "start"]), z.number()]).default("end").describe("end, start, or milliseconds from the step start."),
        debug: z.boolean().default(false),
        width: z.number().int().min(160).max(1280).default(960),
      },
      annotations: { readOnlyHint: true },
    },
    async (a) =>
      run(() => {
        const png = previewPng(readSceneFile(sceneFile(a.scene)), { ...(a.step !== undefined ? { step: a.step } : {}), at: a.at, debug: a.debug, width: a.width });
        return { content: [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }] };
      }),
  );

  server.registerTool(
    "anivo_contact_sheet",
    { title: "Contact sheet", description: "Return one PNG image with the end state of each step and the step titles. Use it to check the full video in one call.", inputSchema: { scene: sceneArg, debug: z.boolean().default(false) }, annotations: { readOnlyHint: true } },
    async (a) =>
      run(() => {
        const png = contactSheetPng(readSceneFile(sceneFile(a.scene)), { debug: a.debug });
        return { content: [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }] };
      }),
  );

  server.registerTool(
    "anivo_export",
    {
      title: "Export",
      description: "Export a video (mp4, webm, gif) or a PNG frame sequence. The output path must be inside the scene folder. It does not overwrite a file unless overwrite is true.",
      inputSchema: {
        scene: sceneArg,
        out: z.string().describe("Output path, for example 'out/auth.mp4'."),
        format: z.enum(["mp4", "webm", "gif", "png-seq", "html", "svg-steps"]).optional().describe("html: one HTML file that plays the scene in a browser. svg-steps: a folder with an SVG of the end of each step."),
        size: z.string().regex(/^\d+x\d+$/).optional().describe("For example 1280x720."),
        fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).optional(),
        steps: z.string().regex(/^\d+(-\d+)?$/).optional().describe("Step range, for example 2-4."),
        captions: z.enum(["bottom", "top"]).optional().describe("Burn the script captions into the video at this edge."),
        overwrite: z.boolean().default(false),
      },
    },
    async (a) =>
      run(async () => {
        const scene = readSceneFile(sceneFile(a.scene));
        const out = inside(a.out);
        if (existsSync(out) && !a.overwrite) throw new ToolError(`The file '${a.out}' exists already.`, "Use another path, or set overwrite to true.");
        const format = a.format ?? (out.endsWith(".webm") ? "webm" : out.endsWith(".gif") ? "gif" : out.endsWith(".mp4") ? "mp4" : out.endsWith(".html") ? "html" : "png-seq");
        if (format === "svg-steps") {
          mkdirSync(out, { recursive: true });
          const tl = resolveTimeline(scene);
          tl.steps.forEach((st, i) => writeFileSync(join(out, `${String(i + 1).padStart(2, "0")}-${st.id}.svg`), renderSvg(scene, Math.max(st.startMs, st.holdEndMs - 1), { assets: assetCache })));
          return text(`Exported ${tl.steps.length} SVG files to ${relative(root, out)}.`);
        }
        if (format === "html") {
          const bytes = exportHtml(scene, out, { assets: assetCache, ...(a.captions ? { captions: a.captions } : {}) });
          return text(`Exported ${relative(root, out)}: ${(bytes / 1e6).toFixed(2)} MB HTML player.`);
        }
        let range: { startMs: number; endMs: number } | undefined;
        if (a.steps) {
          const tl = resolveTimeline(scene);
          const [x, y] = a.steps.split("-").map(Number) as [number, number | undefined];
          const b = y ?? x;
          if (x < 1 || b > tl.steps.length || x > b) throw new ToolError(`The step range '${a.steps}' is not valid.`, `Use numbers from 1 to ${tl.steps.length}.`);
          range = { startMs: tl.steps[x - 1]!.startMs, endMs: tl.steps[b - 1]!.holdEndMs };
        }
        const size = a.size?.split("x").map(Number);
        const r = await exportVideo(scene, { out, format, assets: assetCache, ...(size ? { width: size[0]! - (size[0]! % 2), height: size[1]! - (size[1]! % 2) } : {}), ...(a.fps ? { fps: a.fps } : {}), ...(range ? { range } : {}), ...(a.captions ? { captions: a.captions } : {}) });
        return text(`Exported ${relative(root, r.out)}: ${r.frames} frames, ${(r.durationMs / 1000).toFixed(1)} s${r.bytes ? `, ${(r.bytes / 1e6).toFixed(2)} MB` : ""}.`);
      }),
  );

  server.registerTool(
    "anivo_import",
    {
      title: "Import Excalidraw or Mermaid",
      description: "Make a new scene from an Excalidraw file or Mermaid text (flowchart or sequence diagram). Give 'file' (inside the scene folder) or 'mermaid' text. A Mermaid import makes steps: one for each flowchart layer, or one for each message.",
      inputSchema: {
        scene: sceneArg.describe("New scene file path, for example 'videos/flow.anivo'. It must not exist."),
        file: z.string().optional().describe("An .excalidraw or .mmd file inside the scene folder."),
        mermaid: z.string().optional().describe("Mermaid text, for example 'flowchart LR\\n  a --> b'."),
        steps: z.boolean().default(true),
      },
    },
    async (a) =>
      run(() => {
        const path = sceneFile(a.scene);
        if (existsSync(path)) throw new ToolError(`The file '${a.scene}' exists already.`, "Use another path.");
        if (!a.file === !a.mermaid) throw new ToolError("Give 'file' or 'mermaid', not both and not neither.");
        let r: ReturnType<typeof importText>;
        try {
          r = a.file ? importText(a.file, readFileSync(inside(a.file), "utf8"), { steps: a.steps }) : importText("diagram.mmd", a.mermaid!, { steps: a.steps });
        } catch (err) {
          throw new ToolError(err instanceof Error ? err.message : String(err));
        }
        for (const [id, b] of r.assets) assetCache.set(id, b);
        writeSceneFile(path, r.scene);
        const s = lintSummary(lintScene(r.scene));
        return text([`Imported ${r.format}: ${Object.keys(r.scene.elements).length} elements, ${r.scene.steps.length} steps. Lint: ${s.errors} errors, ${s.warnings} warnings.`, ...r.warnings.map((w) => `Warning: ${w}`), "", sceneSummary(r.scene)].join("\n"));
      }),
  );

  server.registerTool(
    "anivo_image_add",
    {
      title: "Add an image",
      description: "Add a PNG, JPEG, WebP, or SVG file from the scene folder as an image element. Returns the element ID and the asset ID for Anivo Script (image <id> asset=<asset-id>).",
      inputSchema: {
        scene: sceneArg,
        file: z.string().describe("Image file path inside the scene folder."),
        id: z.string().optional(),
        x: z.number().default(100),
        y: z.number().default(100),
        width: z.number().positive().default(480).describe("Width in scene pixels. The height keeps the image ratio."),
        fit: z.enum(["contain", "cover", "fill"]).default("contain"),
      },
    },
    async (a) =>
      run(() => {
        const path = sceneFile(a.scene);
        const scene = readSceneFile(path);
        const file = inside(a.file);
        const asset = importAsset(file, imageMime(file), 20 * 1024 * 1024);
        const size = imageSize(assetCache.get(asset.id)!);
        if (!size) throw new ToolError(`The file '${a.file}' is not a valid image.`, "Use a PNG, JPEG, WebP, or SVG file.");
        const bus = new OperationBus(scene);
        const r = bus.apply({
          label: "Add image",
          ops: [
            ...(asset.id in scene.assets ? [] : [{ op: "asset.add" as const, asset }]),
            { op: "element.add", ...(a.id ? { id: a.id } : {}), type: "image", props: { assetId: asset.id, fit: a.fit, x: a.x, y: a.y, width: a.width, height: Math.round((a.width * size.height) / size.width) } },
          ],
        });
        if (!r.ok) throw new ToolError(r.error.message, r.error.hint);
        writeSceneFile(path, bus.scene);
        return text(`Added image '${r.created[0]}' (asset ${asset.id}, ${size.width}×${size.height} px). In Anivo Script: image ${r.created[0]} asset=${asset.id}`);
      }),
  );

  server.registerTool(
    "anivo_comp_save",
    {
      title: "Save a composition",
      description: "Save elements of a scene with their animations (all steps) as a composition file, to use again in any scene. Groups bring their parts; arrows between the elements come too. Returns the texts (slots) that anivo_comp_insert can set.",
      inputSchema: {
        scene: sceneArg,
        ids: z.array(z.string()).min(1).describe("Element IDs."),
        file: z.string().describe("Composition file path inside the scene folder, for example card.anivo-comp.json."),
        name: z.string().optional(),
      },
    },
    async (a) =>
      run(() => {
        const c = compositionOf(readSceneFile(sceneFile(a.scene)), a.ids, a.name ?? a.file.replace(/\.anivo-comp\.json$|\.json$/, ""), `comp-${Date.now().toString(36)}`, Date.now());
        if ("error" in c) throw new ToolError(c.error);
        writeFileSync(inside(a.file), `${JSON.stringify({ anivoComposition: 1, ...c }, null, 2)}\n`);
        const slots = compositionSlots(c);
        return text(`Saved ${a.file}: ${c.elements.length} elements, ${c.steps.length} steps.${slots.length ? ` Texts (slots): ${slots.map((x) => `${x.id}="${x.text}"`).join(", ")}.` : ""}`);
      }),
  );

  server.registerTool(
    "anivo_comp_insert",
    {
      title: "Insert a composition",
      description: "Insert a composition file into a scene: the elements get new IDs at a place, and the steps come after a step (or at the end). Set its texts with 'texts' (slot ID to text).",
      inputSchema: {
        scene: sceneArg,
        file: z.string().describe("Composition file path inside the scene folder."),
        x: z.number().default(100),
        y: z.number().default(100),
        after: z.string().optional().describe("Step ID: the steps of the composition come after it."),
        texts: z.record(z.string(), z.string()).optional().describe("New texts, by composition element ID (from anivo_comp_save)."),
      },
    },
    async (a) =>
      run(() => {
        const data = JSON.parse(readFileSync(inside(a.file), "utf8")) as Composition & { anivoComposition?: number };
        if (data.anivoComposition !== 1 || !Array.isArray(data.elements) || !Array.isArray(data.steps)) throw new ToolError(`'${a.file}' is not an Anivo composition file.`);
        const path = sceneFile(a.scene);
        const bus = new OperationBus(readSceneFile(path));
        const ins = insertCompositionOps(bus.scene, data, { x: a.x, y: a.y }, a.after, a.texts ?? {});
        const r = bus.apply({ label: `Insert ${data.name}`, ops: ins.ops });
        if (!r.ok) throw new ToolError(r.error.message, r.error.hint);
        writeSceneFile(path, bus.scene);
        return text(`Inserted '${data.name}': ${ins.ids.join(", ")} and ${ins.steps} steps.`);
      }),
  );

  server.registerTool(
    "anivo_transcribe",
    {
      title: "Transcribe the voiceover",
      description: "Transcribe the voiceover locally with whisper.cpp, save the word times, and align the script lines to them (each matched line sets a cue on its step). Needs whisper-cli and a model file (ANIVO_WHISPER_MODEL). If you have the words already, use anivo_ops_apply with script.align instead.",
      inputSchema: { scene: sceneArg, language: z.string().optional().describe("Language code, for example en."), align: z.boolean().default(true) },
    },
    async (a) =>
      run(() => {
        const path = sceneFile(a.scene);
        const scene = readSceneFile(path);
        const vo = scene.audio.find((t) => t.kind === "voiceover");
        if (!vo) throw new ToolError("The scene has no voiceover track.", "Add a voiceover first.");
        const bytes = assetCache.get(vo.assetId);
        if (!bytes) throw new ToolError("The voiceover file is missing from the scene.", "Add the voiceover again.");
        const words = transcribe(bytes, a.language ? { language: a.language } : {});
        const bus = new OperationBus(scene);
        const align = a.align && scene.script.length > 0;
        const onsets = align ? audioOnsets(bytes) : [];
        const r = bus.apply({ label: "Transcribe", ops: align ? [{ op: "script.align", words, ...(onsets.length ? { onsets } : {}) }] : [{ op: "audio.update", id: vo.id, set: { transcript: { words } } }] });
        if (!r.ok) throw new ToolError(r.error.message, r.error.hint);
        writeSceneFile(path, bus.scene);
        const unmatched = bus.scene.script.filter((l) => l.unmatched).length;
        return text(`Transcribed ${words.length} words.${align ? ` Aligned ${bus.scene.script.length - unmatched} of ${bus.scene.script.length} script lines.` : ""}`);
      }),
  );

  server.registerTool(
    "anivo_captions",
    {
      title: "Captions",
      description: "Make SRT or WebVTT captions from the script lines that link to steps. Returns the text. With out, it also writes the file inside the scene folder.",
      inputSchema: {
        scene: sceneArg,
        format: z.enum(["srt", "vtt"]).default("srt"),
        out: z.string().optional().describe("Output path, for example 'out/auth.srt'."),
        overwrite: z.boolean().default(false),
      },
    },
    async (a) =>
      run(() => {
        const caps = sceneCaptions(readSceneFile(sceneFile(a.scene)));
        if (caps.length === 0) throw new ToolError("The scene has no captions.", "Set the script with the script.set operation, and link each line to a step.");
        const body = a.format === "vtt" ? toVtt(caps) : toSrt(caps);
        if (a.out) {
          const out = inside(a.out);
          if (existsSync(out) && !a.overwrite) throw new ToolError(`The file '${a.out}' exists already.`, "Use another path, or set overwrite to true.");
          writeFileSync(out, body);
        }
        return text(body);
      }),
  );

  server.registerTool(
    "anivo_icons_search",
    { title: "Search icons", description: "Search icon names by name and tag. Use the result as pack:name in Anivo Script, for example icon db lucide:database \"Database\".", inputSchema: { query: z.string(), pack: z.enum(["lucide", "fluent"]).optional(), limit: z.number().int().min(1).max(50).default(12) }, annotations: { readOnlyHint: true } },
    async (a) => text(searchIcons(a.query, { ...(a.pack ? { pack: a.pack } : {}), limit: a.limit }).map((r) => `${r.pack}:${r.name}`).join("\n") || "No icons match. Try a more general word."),
  );

  server.registerTool(
    "anivo_schema",
    { title: "JSON Schema", description: "Return the JSON Schema of a scene or of an operation transaction.", inputSchema: { kind: z.enum(["scene", "ops"]).default("ops") }, annotations: { readOnlyHint: true } },
    async (a) => text(JSON.stringify(jsonSchema(a.kind))),
  );

  server.registerTool(
    "anivo_undo",
    { title: "Undo", description: "Undo the last change that this server made to a scene.", inputSchema: { scene: sceneArg } },
    async (a) =>
      run(() => {
        const path = sceneFile(a.scene);
        const prev = history.get(path)?.pop();
        if (!prev) throw new ToolError("There is no change to undo for this scene in this session.");
        writeSceneFile(path, prev);
        return text(`Undid the last change of ${relative(root, path)}.`);
      }),
  );

  server.registerResource("guide", "anivo://guide", { title: "Anivo scene-agent guide", mimeType: "text/markdown" }, async (uri) => ({ contents: [{ uri: uri.href, text: guideText() }] }));
  server.registerResource("schema-ops", "anivo://schema/ops", { title: "Operation transaction JSON Schema", mimeType: "application/json" }, async (uri) => ({ contents: [{ uri: uri.href, text: JSON.stringify(jsonSchema("ops")) }] }));
  server.registerResource("schema-scene", "anivo://schema/scene", { title: "Scene JSON Schema", mimeType: "application/json" }, async (uri) => ({ contents: [{ uri: uri.href, text: JSON.stringify(jsonSchema("scene")) }] }));

  server.registerPrompt(
    "explain-concept",
    {
      title: "Explain a concept with a video",
      description: "Start a conversation that makes an explainer video.",
      argsSchema: { topic: z.string(), steps: z.string().optional(), style: z.string().optional() },
    },
    (a) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Make an explainer video with Anivo about: ${a.topic}.\nUse ${a.steps ?? "4 to 6"} steps and the ${a.style ?? "clean"} style.\nCall anivo_guide first. Then write the scene with anivo_script_apply, check it with anivo_lint and anivo_contact_sheet, fix the problems, and export an MP4 with anivo_export.`,
          },
        },
      ],
    }),
  );

  return server;
}
