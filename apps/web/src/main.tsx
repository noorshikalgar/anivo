import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App.js";
import { useEditor } from "./store.js";

// Test hook: Playwright reads and drives the editor store in development builds.
if (import.meta.env.DEV) (window as unknown as { __anivo: typeof useEditor }).__anivo = useEditor;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
