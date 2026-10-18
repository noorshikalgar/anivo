/**
 * Chat with a model that uses the AI panel tools (docs/09 "AI panel").
 * Providers: Anthropic (the SDK, in the browser), an OpenAI-compatible endpoint,
 * and Ollama (its OpenAI-compatible endpoint). The user supplies the key.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AI_TOOLS, inputSchema, runTool } from "./tools.js";
import { type AiSettings, type ChatItem, DEFAULTS, type History } from "./types.js";

export type { AiSettings, ChatItem, History };

export interface ChatEvents {
  onText(delta: string): void;
  onItem(item: ChatItem): void;
}

const MAX_TURNS = 24;

/** Short form of a tool call for the panel. */
function summarize(name: string, input: unknown, out: { text: string; error?: boolean }): string {
  const first = out.text.split("\n")[0] ?? "";
  const arg = typeof input === "object" && input ? Object.entries(input as Record<string, unknown>).map(([k, v]) => `${k}=${typeof v === "string" ? (v.length > 24 ? `${v.slice(0, 24)}…` : v) : JSON.stringify(v)}`).join(" ") : "";
  return `${name}${arg ? ` ${arg}` : ""} → ${first.slice(0, 120)}`;
}

// --- Anthropic ---------------------------------------------------------------------------


async function chatAnthropic(s: AiSettings, system: string, history: History, user: string, ev: ChatEvents, signal: AbortSignal): Promise<void> {
  const client = new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true, ...(s.baseUrl && s.baseUrl !== DEFAULTS.anthropic.baseUrl ? { baseURL: s.baseUrl } : {}) });
  const tools: Anthropic.Tool[] = AI_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: inputSchema(t) as Anthropic.Tool.InputSchema, eager_input_streaming: true }));
  const messages = history.anthropic;
  messages.push({ role: "user", content: user });
  let jsonRetries = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.messages.stream({ model: s.model, max_tokens: 16000, thinking: { type: "adaptive" }, system, tools, messages }, { signal });
    stream.on("text", (d) => ev.onText(d));
    let message: Anthropic.Message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only a tool input that is not JSON at all is retried. API errors go to the user.
      if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    if (text) ev.onItem({ kind: "assistant", text });
    if (message.stop_reason === "refusal") throw new Error("The model did not continue (refusal).");
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (calls.length === 0) {
      messages.push({ role: "assistant", content: message.content });
      return;
    }
    if (message.stop_reason === "max_tokens") throw new Error("The answer was too long (max_tokens). Ask for a smaller change.");
    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const c of calls) {
      const out = await runTool(c.name, c.input);
      ev.onItem({ kind: "tool", name: c.name, summary: summarize(c.name, c.input, out), error: !!out.error });
      results.push({
        type: "tool_result",
        tool_use_id: c.id,
        ...(out.error ? { is_error: true } : {}),
        content: out.image ? [{ type: "text", text: out.text }, { type: "image", source: { type: "base64", media_type: "image/png", data: out.image } }] : out.text,
      });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error(`The model used more than ${MAX_TURNS} turns. Ask again to continue.`);
}

// --- OpenAI-compatible (and Ollama) ------------------------------------------------------

interface OaiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

async function chatOpenAi(s: AiSettings, system: string, history: History, user: string, ev: ChatEvents, signal: AbortSignal): Promise<void> {
  const tools = AI_TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: inputSchema(t) } }));
  const messages = history.openai;
  if (messages.length === 0) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });
  const url = `${s.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", ...(s.apiKey ? { authorization: `Bearer ${s.apiKey}` } : {}) },
      body: JSON.stringify({ model: s.model, messages, tools }),
    });
    if (!res.ok) throw new Error(`The endpoint answered HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: OaiToolCall[] }; finish_reason?: string }[] };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("The endpoint sent no message.");
    if (msg.content) {
      ev.onText(msg.content);
      ev.onItem({ kind: "assistant", text: msg.content });
    }
    messages.push({ role: "assistant", content: msg.content ?? "", ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
    if (!msg.tool_calls?.length) return;
    for (const c of msg.tool_calls) {
      let input: unknown;
      try {
        input = JSON.parse(c.function.arguments || "{}");
      } catch {
        input = undefined;
      }
      const out = input === undefined ? { text: "Error: the arguments are not valid JSON.", error: true } : await runTool(c.function.name, input);
      ev.onItem({ kind: "tool", name: c.function.name, summary: summarize(c.function.name, input, out), error: !!out.error });
      // Chat Completions tool results are text only.
      messages.push({ role: "tool", tool_call_id: c.id, content: out.image ? `${out.text} (The image is not available with this provider. Use lint and scene_summary.)` : out.text });
    }
  }
  throw new Error(`The model used more than ${MAX_TURNS} turns. Ask again to continue.`);
}

export function chat(s: AiSettings, system: string, history: History, user: string, ev: ChatEvents, signal: AbortSignal): Promise<void> {
  return s.provider === "anthropic" ? chatAnthropic(s, system, history, user, ev, signal) : chatOpenAi(s, system, history, user, ev, signal);
}
