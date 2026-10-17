import { defineConfig } from "vite";

// Phase 0 spike page. It serves assets/ (fonts, templates) at the site root.
export default defineConfig({
  publicDir: "../../assets",
  server: { port: 5174, strictPort: true },
});
