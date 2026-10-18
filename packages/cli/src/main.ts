import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolveTimeline } from "@anivo/engine";
import { type NodeExportFormat, exportVideo } from "@anivo/export-node";
import { formatLint, lintScene, lintSummary } from "@anivo/lint";
import { OperationBus } from "@anivo/ops";
import { searchIcons } from "@anivo/render";
import { type Scene, loadScene } from "@anivo/schema";
import { applyScript, printScene } from "@anivo/script";
import { ToolError, contactSheetPng, jsonSchema, previewPng, readSceneFile, sceneSummary, stepTime, writeSceneFile } from "@anivo/tools";
import { registerBundledAssets } from "@anivo/export-node";
import { Command, Option } from "commander";

const program = new Command();
program.name("anivo").description("Anivo: explainer videos from diagrams. Render, export, lint, preview, and run the MCP server.").option("--json", "Print machine-readable JSON");

const json = () => program.opts<{ json?: boolean }>().json === true;
const print = (text: string, data?: unknown) => {
  if (json()) process.stdout.write(`${JSON.stringify(data ?? { text }, null, 2)}\n`);
  else process.stdout.write(`${text}\n`);
};

function templatePath(name: string): string {
  const p = new URL(`../../../assets/templates/${name}.anivo.json`, import.meta.url);
  if (!existsSync(p)) throw new ToolError(`The template '${name}' does not exist.`, "Use: load-balancer, tcp-handshake, docker-layers.");
  return p.pathname;
}

function emptyScene(title: string): Scene {
  const r = loadScene({ schemaVersion: 1, meta: { title } });
  if (!r.ok) throw new Error("empty scene");
  return r.scene;
}

function lintLine(scene: Scene): string {
  const s = lintSummary(lintScene(scene));
  return `Lint: ${s.errors} errors, ${s.warnings} warnings, ${s.infos} notes. Run 'anivo lint' for details.`;
}

program
  .command("new")
  .description("Make a new scene file")
  .argument("<file>", "Output file: .anivo, .json, .txt, or a folder ending in /")
  .option("--template <name>", "Start from a built-in template")
  .option("--title <title>", "Scene title", "Untitled")
  .action((file: string, o: { template?: string; title: string }) => {
    const scene = o.template ? readSceneFile(templatePath(o.template)) : emptyScene(o.title);
    writeSceneFile(file, scene);
    print(`Made ${file}.`, { file });
  });

program
  .command("apply")
  .description("Apply Anivo Script (.txt) or an operation transaction (.json) to a scene")
  .argument("<scene>", "Scene file. It is made if it does not exist.")
  .argument("<input>", "Anivo Script file (.txt) or transaction JSON, or - for standard input")
  .addOption(new Option("--mode <mode>", "replace: the script is the full scene; append: add to the scene").choices(["replace", "append"]))
  .action((sceneFile: string, input: string, o: { mode?: "replace" | "append" }) => {
    const text = input === "-" ? readFileSync(0, "utf8") : readFileSync(input, "utf8");
    const base = existsSync(sceneFile) ? readSceneFile(sceneFile) : undefined;
    let scene: Scene;
    if (input.endsWith(".json")) {
      const bus = new OperationBus(base ?? emptyScene("Untitled"));
      const r = bus.apply(JSON.parse(text));
      if (!r.ok) throw new ToolError(`${r.error.message} (at ${r.error.path})`, r.error.hint);
      scene = bus.scene;
    } else {
      const mode = o.mode ?? (base ? "append" : "replace");
      const r = applyScript(text, { mode, ...(base ? { base } : {}) });
      if (!r.ok) throw new ToolError(`The script has errors:\n${r.errors.map((e) => `  line ${e.line}, column ${e.col}: ${e.message}${e.hint ? ` ${e.hint}` : ""}`).join("\n")}`);
      scene = r.scene;
    }
    writeSceneFile(sceneFile, scene);
    const results = lintScene(scene);
    print(`Saved ${sceneFile}. ${lintLine(scene)}`, { file: sceneFile, lint: lintSummary(results) });
  });

program
  .command("print")
  .description("Print a scene as Anivo Script")
  .argument("<scene>")
  .action((f: string) => {
    process.stdout.write(printScene(readSceneFile(f)));
  });

program
  .command("summary")
  .description("Print a compact outline: elements, steps, and times")
  .argument("<scene>")
  .action((f: string) => print(sceneSummary(readSceneFile(f))));

program
  .command("validate")
  .description("Check the scene file format. Exit code 1 if it is not valid")
  .argument("<scene>")
  .action((f: string) => {
    readSceneFile(f);
    print(`${f} is valid.`, { valid: true });
  });

program
  .command("lint")
  .description("Check layout and timing. Exit code 1 if there are errors")
  .argument("<scene>")
  .action((f: string) => {
    const results = lintScene(readSceneFile(f));
    print(formatLint(results), { results, summary: lintSummary(results) });
    if (lintSummary(results).errors > 0) process.exitCode = 1;
  });

program
  .command("preview")
  .description("Render one frame to PNG")
  .argument("<scene>")
  .option("--step <step>", "Step number (0 is the base state) or step ID. Default: the last step")
  .option("--at <at>", "end, start, or milliseconds from the step start", "end")
  .option("--out <file>", "PNG file", "preview.png")
  .option("--width <px>", "Image width", "960")
  .option("--debug", "Draw element IDs")
  .action((f: string, o: { step?: string; at: string; out: string; width: string; debug?: boolean }) => {
    const at = o.at === "end" || o.at === "start" ? o.at : Number(o.at);
    writeFileSync(o.out, previewPng(readSceneFile(f), { ...(o.step !== undefined ? { step: o.step } : {}), at, width: Number(o.width), debug: o.debug ?? false }));
    print(`Wrote ${o.out}.`, { file: o.out });
  });

program
  .command("contact-sheet")
  .description("One PNG with the end state of each step")
  .argument("<scene>")
  .option("--out <file>", "PNG file", "contact-sheet.png")
  .option("--cols <n>", "Columns")
  .option("--debug", "Draw element IDs")
  .action((f: string, o: { out: string; cols?: string; debug?: boolean }) => {
    writeFileSync(o.out, contactSheetPng(readSceneFile(f), { ...(o.cols ? { cols: Number(o.cols) } : {}), debug: o.debug ?? false }));
    print(`Wrote ${o.out}.`, { file: o.out });
  });

program
  .command("render")
  .description("Export a video or images")
  .argument("<scene>")
  .requiredOption("--out <file>", "Output file (.mp4, .webm, .gif, .mov) or folder for PNG frames")
  .addOption(new Option("--format <format>", "Output format (default from the file extension)").choices(["mp4", "webm", "gif", "prores", "png-seq"]))
  .option("--size <WxH>", "Video size, for example 1280x720")
  .addOption(new Option("--fps <fps>", "Frame rate").choices(["24", "30", "60"]))
  .option("--steps <a-b>", "Step range, for example 2-4")
  .addOption(new Option("--quality <q>", "Quality").choices(["draft", "standard", "high"]).default("standard"))
  .addOption(new Option("--style <style>", "Override the style").choices(["clean", "sketch"]))
  .action(async (f: string, o: { out: string; format?: NodeExportFormat; size?: string; fps?: string; steps?: string; quality: "draft" | "standard" | "high"; style?: "clean" | "sketch" }) => {
    const scene = readSceneFile(f);
    const format: NodeExportFormat = o.format ?? (o.out.endsWith(".webm") ? "webm" : o.out.endsWith(".gif") ? "gif" : o.out.endsWith(".mov") ? "prores" : o.out.endsWith(".mp4") ? "mp4" : "png-seq");
    let range: { startMs: number; endMs: number } | undefined;
    if (o.steps) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(o.steps);
      const tl = resolveTimeline(scene);
      const a = m ? Number(m[1]) : NaN;
      const b = m ? Number(m[2] ?? m[1]) : NaN;
      if (!m || a < 1 || b > tl.steps.length || a > b) throw new ToolError(`The step range '${o.steps}' is not valid.`, `Use numbers from 1 to ${tl.steps.length}, for example 1-${tl.steps.length}.`);
      range = { startMs: tl.steps[a - 1]!.startMs, endMs: tl.steps[b - 1]!.holdEndMs };
    }
    const size = o.size ? /^(\d+)x(\d+)$/.exec(o.size) : null;
    if (o.size && !size) throw new ToolError(`The size '${o.size}' is not valid.`, "Write: 1920x1080");
    let last = -1;
    const r = await exportVideo(scene, {
      out: o.out,
      format,
      quality: o.quality,
      ...(size ? { width: Number(size[1]) - (Number(size[1]) % 2), height: Number(size[2]) - (Number(size[2]) % 2) } : {}),
      ...(o.fps ? { fps: Number(o.fps) as 24 | 30 | 60 } : {}),
      ...(range ? { range } : {}),
      ...(o.style ? { style: o.style } : {}),
      onProgress: (d, n) => {
        const pct = Math.floor((d / n) * 100);
        if (!json() && process.stderr.isTTY && pct !== last) process.stderr.write(`\rRendering ${pct}%`);
        last = pct;
      },
    });
    if (!json() && process.stderr.isTTY) process.stderr.write("\n");
    print(`Wrote ${r.out}: ${r.frames} frames, ${(r.durationMs / 1000).toFixed(1)} s${r.bytes ? `, ${(r.bytes / 1e6).toFixed(2)} MB` : ""}.`, r);
  });

program
  .command("convert")
  .description("Convert between .anivo, .json, folder, and Anivo Script (.txt)")
  .argument("<in>")
  .argument("<out>")
  .action((i: string, o: string) => {
    writeSceneFile(o, readSceneFile(i));
    print(`Wrote ${o}.`, { file: o });
  });

program
  .command("schema")
  .description("Print the JSON Schema of a scene or of an operation transaction")
  .addOption(new Option("--kind <kind>", "scene or ops").choices(["scene", "ops"]).default("scene"))
  .action((o: { kind: "scene" | "ops" }) => {
    process.stdout.write(`${JSON.stringify(jsonSchema(o.kind), null, 2)}\n`);
  });

const icons = program.command("icons").description("Icon packs");
icons
  .command("search")
  .description("Search icons by name and tag")
  .argument("<query>")
  .option("--pack <pack>", "lucide or fluent")
  .option("--limit <n>", "Maximum results", "20")
  .action((q: string, o: { pack?: string; limit: string }) => {
    registerBundledAssets();
    const r = searchIcons(q, { ...(o.pack ? { pack: o.pack } : {}), limit: Number(o.limit) });
    print(r.map((x) => `${x.pack}:${x.name}`).join("\n") || "No icons match.", r);
  });

program
  .command("mcp")
  .description("Run the MCP server on standard input and output, for agents such as Claude Code")
  .option("--root <dir>", "Folder for scene files and exports. The server reads and writes only inside it", ".")
  .action(async (o: { root: string }) => {
    const { runStdioServer } = await import("@anivo/mcp");
    await runStdioServer(o.root);
  });

program
  .command("time")
  .description("Print the time of a step position in milliseconds")
  .argument("<scene>")
  .argument("<step>")
  .action((f: string, s: string) => print(String(stepTime(readSceneFile(f), s))));

export async function main(argv = process.argv): Promise<void> {
  // Lint, preview, and render need the bundled icon packs and fonts.
  registerBundledAssets();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof ToolError) {
      process.stderr.write(`Error: ${err.message}${err.hint ? `\n${err.hint}` : ""}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}
