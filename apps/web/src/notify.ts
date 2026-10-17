import { useEditor } from "./store.js";

export interface Notice {
  id: number;
  text: string;
  intent: "success" | "error" | "info";
}

let next = 1;

/** Show a short message in the editor (a Fluent toast). */
export function notify(text: string, intent: Notice["intent"] = "info"): void {
  useEditor.setState({ notice: { id: next++, text, intent } });
}

/** Run an async action and show its error as a message. */
export async function withErrors(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    notify(err instanceof Error ? err.message : String(err), "error");
  }
}
