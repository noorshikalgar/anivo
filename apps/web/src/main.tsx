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
  // Add an audio file from base64 bytes, as the file picker would.
  (window as unknown as { __anivoAddAudio: unknown }).__anivoAddAudio = async (b64: string, name: string, kind: "voiceover" | "music" | "sfx") =>
    (await import("./audio.js")).addAudio(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), name, "", kind);
  (window as unknown as { __anivoBench: unknown }).__anivoBench = async (style: "clean" | "sketch") => (await import("./dev/bench.js")).benchFrames(style);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
