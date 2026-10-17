import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Serve assets/ (fonts, icons, templates) at the site root.
  publicDir: "../../assets",
  server: { port: 5173, strictPort: true },
});
