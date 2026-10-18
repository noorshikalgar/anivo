import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Serve assets/ (fonts, icons, templates) at the site root.
  publicDir: "../../assets",
  server: { port: 5173, strictPort: true },
  // The speech worker loads Transformers.js on demand. Pre-bundle it, so the dev
  // server does not find a new dependency at that time and reload the page.
  optimizeDeps: { include: ["@huggingface/transformers"] },
  worker: { format: "es" },
});
