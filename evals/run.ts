/**
 * Agent eval suite (docs/09 "Agent eval suite", FR-AGENT-13).
 *
 * For each prompt in evals/prompts.json:
 * 1. Start the Anivo MCP server in-process with an empty scene folder.
 * 2. Run an agent (Claude, manual tool-use loop) that uses the MCP tools.
 * 3. Score the result: valid scene, lint errors and warnings, step count,
 *    and a model grader score (1 to 5) of the contact sheet (evals/rubric.md).
 *
 * Run:   pnpm eval [--limit 3] [--only dns,tcp] [--model claude-opus-5-5] [--dry]
 * Needs: Anthropic credentials (ANTHROPIC_API_KEY or an `ant auth login` profile).
 *        A real run costs money. --dry checks the harness with no API calls.
 * Output: evals/results/<timestamp>.json and a summary table on stdout.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { lintScene, lintSummary } from "../packages/lint/src/index.js";
import { createAnivoServer } from "../packages/mcp/src/index.js";
import { contactSheetPng, readSceneFile } from "../packages/tools/src/index.js";

interface Prompt {
  id: string;
  prompt: string;
  steps: number;
}

interface Result {
  id: string;
  valid: boolean;
  errors: number;
  warnings: number;
  steps: number;
  stepsOk: boolean;
  grade: number | null;
  reason: string;
  turns: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  failure?: string;
}

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const MODEL = arg("model") ?? "claude-opus-5-5";
const GRADER_MODEL = arg("grader") ?? "claude-opus-5-5";
const DRY = args.includes("--dry");
const MAX_TURNS = 40;

let prompts = JSON.parse(readFileSync("evals/prompts.json", "utf8")) as Prompt[];
const only = arg("only");
if (only) prompts = prompts.filter((p) => only.split(",").includes(p.id));
const limit = arg("limit");
if (limit) prompts = prompts.slice(0, Number(limit));

const client = DRY ? undefined : new Anthropic();
const rubric = readFileSync("evals/rubric.md", "utf8");

/** MCP tool result content to Claude tool_result content (text and images). */
function toToolResult(content: unknown): Anthropic.ToolResultBlockParam["content"] {
  const blocks: Exclude<Anthropic.ToolResultBlockParam["content"], string | undefined> = [];
  for (const c of (content as { type: string; text?: string; data?: string; mimeType?: string }[]) ?? []) {
    if (c.type === "text") blocks.push({ type: "text", text: c.text ?? "" });
    else if (c.type === "image" && c.data) blocks.push({ type: "image", source: { type: "base64", media_type: "image/png", data: c.data } });
  }
  return blocks.length ? blocks : [{ type: "text", text: "(no content)" }];
}

async function runOne(p: Prompt): Promise<Result> {
  const root = mkdtempSync(join(tmpdir(), `anivo-eval-${p.id}-`));
  const server = createAnivoServer({ root });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: "anivo-eval", version: "1.0.0" });
  await mcp.connect(b);

  const tools: Anthropic.Tool[] = (await mcp.listTools()).tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
  const guide = (await mcp.callTool({ name: "anivo_guide", arguments: {} })) as { content: { text: string }[] };
  const system = `${guide.content[0]?.text ?? ""}\n\nWork in the scene folder that the tools use. Save the scene as video.anivo. When the video is done and lint has no errors, reply with a short report and stop.`;
  const result: Result = { id: p.id, valid: false, errors: 0, warnings: 0, steps: 0, stepsOk: false, grade: null, reason: "", turns: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 };

  if (DRY) {
    // Harness check with no API calls: a fixed script through the same tools.
    await mcp.callTool({ name: "anivo_script_apply", arguments: { scene: "video.anivo", script: `scene "${p.id}"\nbox a "Start"\nbox b "End" right-of=a\narrow a -> b\nstep "One"\n  enter a, b pop\nstep "Two"\n  flow a->b\n` } });
  } else {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${p.prompt}\nUse ${p.steps} steps.` }];
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      result.turns++;
      const response = await client!.messages
        .stream({ model: MODEL, max_tokens: 32000, output_config: { effort: "medium" }, system, tools, messages })
        .finalMessage();
      result.inputTokens += response.usage.input_tokens;
      result.outputTokens += response.usage.output_tokens;
      if (response.stop_reason === "refusal") {
        result.failure = `refusal (${response.stop_details?.category ?? "no category"})`;
        break;
      }
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "pause_turn") continue;
      const calls = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
      if (calls.length === 0) break;
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        result.toolCalls++;
        try {
          const r = (await mcp.callTool({ name: call.name, arguments: call.input as Record<string, unknown> })) as { content: unknown; isError?: boolean };
          results.push({ type: "tool_result", tool_use_id: call.id, content: toToolResult(r.content), ...(r.isError ? { is_error: true } : {}) });
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: `Error: ${err instanceof Error ? err.message : String(err)}`, is_error: true });
        }
      }
      // All tool results of one assistant turn go back in one user message.
      messages.push({ role: "user", content: results });
    }
  }

  const file = join(root, "video.anivo");
  if (!existsSync(file)) {
    result.failure ??= "no video.anivo";
    return result;
  }
  try {
    const scene = readSceneFile(file);
    result.valid = true;
    const s = lintSummary(lintScene(scene));
    result.errors = s.errors;
    result.warnings = s.warnings;
    result.steps = scene.steps.length;
    result.stepsOk = Math.abs(scene.steps.length - p.steps) <= 1;
    const sheet = contactSheetPng(scene).toString("base64");
    writeFileSync(join("evals", "results", `${p.id}.png`), Buffer.from(sheet, "base64"));
    if (!DRY) {
      const g = await client!.messages.create({
        model: GRADER_MODEL,
        max_tokens: 4000,
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: { type: "object", properties: { score: { type: "integer", minimum: 1, maximum: 5 }, reason: { type: "string" } }, required: ["score", "reason"], additionalProperties: false },
          },
        },
        system: `You grade explainer videos made with Anivo. Use this rubric.\n\n${rubric}`,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `The request was: "${p.prompt}" (${p.steps} steps). This is the contact sheet: the end state of each step.` },
              { type: "image", source: { type: "base64", media_type: "image/png", data: sheet } },
            ],
          },
        ],
      });
      const text = g.content.find((c): c is Anthropic.TextBlock => c.type === "text")?.text ?? "{}";
      const parsed = JSON.parse(text) as { score?: number; reason?: string };
      result.grade = parsed.score ?? null;
      result.reason = parsed.reason ?? "";
    }
  } catch (err) {
    result.failure = err instanceof Error ? err.message : String(err);
  }
  return result;
}

mkdirSync("evals/results", { recursive: true });
const results: Result[] = [];
for (const p of prompts) {
  process.stderr.write(`${p.id} … `);
  const r = await runOne(p);
  results.push(r);
  process.stderr.write(`${r.valid ? "valid" : "INVALID"}, ${r.errors} errors, grade ${r.grade ?? "-"}${r.failure ? `, ${r.failure}` : ""}\n`);
}

const passed = results.filter((r) => r.valid && r.errors === 0 && r.stepsOk);
const graded = results.filter((r) => r.grade !== null);
const mean = graded.length ? graded.reduce((s, r) => s + r.grade!, 0) / graded.length : null;
const summary = {
  model: MODEL,
  grader: GRADER_MODEL,
  dry: DRY,
  date: new Date().toISOString(),
  prompts: results.length,
  passed: passed.length,
  meanGrade: mean,
  tokens: { input: results.reduce((s, r) => s + r.inputTokens, 0), output: results.reduce((s, r) => s + r.outputTokens, 0) },
};
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join("evals", "results", `${stamp}.json`), `${JSON.stringify({ summary, results }, null, 2)}\n`);

console.log("\n| Prompt | Valid | Errors | Warnings | Steps | Grade | Turns | Tool calls |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of results) console.log(`| ${r.id} | ${r.valid ? "yes" : "no"} | ${r.errors} | ${r.warnings} | ${r.steps}${r.stepsOk ? "" : " (!)"} | ${r.grade ?? "-"} | ${r.turns} | ${r.toolCalls} |`);
console.log(`\nPassed ${passed.length} of ${results.length} (valid, no lint errors, step count within 1). Mean grade: ${mean?.toFixed(2) ?? "-"}.`);
console.log(`Phase 2 gate: 8 of 10 valid with no human edit, and a mean grade of 3.5 or more.`);
