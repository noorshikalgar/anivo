import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { serviceWorker } from "./sw-plugin.js";

export default defineConfig({
  plugins: [react(), serviceWorker(fileURLToPath(new URL("../../assets", import.meta.url)))],
  // Serve assets/ (fonts, icons, templates) at the site root.
  publicDir: "../../assets",
  server: { port: 5173, strictPort: true },
  // The speech worker loads Transformers.js on demand. Pre-bundle it, so the dev
  // server does not find a new dependency at that time and reload the page.
  optimizeDeps: { include: ["@huggingface/transformers"] },
  worker: { format: "es" },
});
