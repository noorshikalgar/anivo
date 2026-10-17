import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App.js";
import { loadScene } from "@anivo/schema";
import { useEditor } from "./store.js";

// Test hook: Playwright reads and drives the editor store in development builds.
if (import.meta.env.DEV) {
  const w = window as unknown as { __anivo: typeof useEditor; __anivoOpen: (json: unknown) => boolean };
  w.__anivo = useEditor;
  // Open a scene from plain JSON, so tests do not depend on the built-in templates.
  w.__anivoOpen = (json) => {
    const r = loadScene(json);
    if (!r.ok) return false;
    useEditor.getState().openScene(r.scene);
    useEditor.setState({ dirty: false });
    return true;
  };
  (window as unknown as { __anivoBench: unknown }).__anivoBench = async (style: "clean" | "sketch") => (await import("./dev/bench.js")).benchFrames(style);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
