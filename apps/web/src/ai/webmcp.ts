/**
 * WebMCP (FR-AGENT-12): when the browser has `navigator.modelContext`, the editor
 * gives its tools to the browser's agent. These are the AI panel tools; changes go
 * through the operation bus, so the user can undo them. Without the API, nothing happens.
 */
import { AI_TOOLS, inputSchema, runTool } from "./tools.js";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: unknown): Promise<{ content: Content[]; isError?: boolean }>;
}
interface ModelContext {
  registerTool?(tool: WebMcpTool): { unregister(): void } | void;
  provideContext?(ctx: { tools: WebMcpTool[] }): void;
}

/** Register the tools. Returns a function that removes them, or null without WebMCP. */
export function startWebMcp(): (() => void) | null {
  const mc = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
  if (!mc) return null;
  const tools: WebMcpTool[] = AI_TOOLS.map((t) => ({
    name: `anivo_${t.name}`,
    description: t.description,
    inputSchema: inputSchema(t),
    async execute(input: unknown) {
      const out = await runTool(t.name, input);
      const content: Content[] = [{ type: "text", text: out.text }];
      if (out.image) content.push({ type: "image", data: out.image, mimeType: "image/png" });
      return { content, ...(out.error ? { isError: true } : {}) };
    },
  }));
  if (mc.registerTool) {
    const handles = tools.map((t) => mc.registerTool!(t));
    return () => handles.forEach((h) => h?.unregister());
  }
  mc.provideContext?.({ tools });
  return () => mc.provideContext?.({ tools: [] });
}
