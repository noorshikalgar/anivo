import { ImportError, type ImportResult, importExcalidraw } from "./excalidraw.js";
import { importMermaid } from "./mermaid.js";

/**
 * Import a file by its name and text: Excalidraw (.excalidraw or JSON with "elements")
 * or Mermaid (.mmd, .mermaid, or text that starts with a Mermaid diagram type).
 */
export function importText(name: string, text: string, opts: { steps?: boolean } = {}): ImportResult & { format: "excalidraw" | "mermaid" } {
  const title = name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "") || undefined;
  const t = text.trim();
  if (/\.excalidraw(\.json)?$/i.test(name) || (t.startsWith("{") && /"elements"\s*:/.test(t))) {
    let json: unknown;
    try {
      json = JSON.parse(t);
    } catch {
      throw new ImportError(`The file '${name}' is not valid JSON.`);
    }
    return { ...importExcalidraw(json, title ? { title } : {}), format: "excalidraw" };
  }
  // A Markdown file can hold the diagram in a ```mermaid block.
  const fenced = /```mermaid\s*\n([\s\S]*?)```/.exec(t);
  return { ...importMermaid(fenced ? fenced[1]! : t, { ...(title ? { title } : {}), ...opts }), format: "mermaid" };
}
