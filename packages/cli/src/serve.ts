/**
 * `anivo serve`: serve the web app on this computer and open a scene in it (docs/09).
 * The scene goes to the editor from /local/scene (the .anivo archive with its assets).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, normalize, sep } from "node:path";
import { homePath } from "@anivo/export-node";
import { packArchive } from "@anivo/fileio";
import { ToolError, assetCache, readSceneFile } from "@anivo/tools";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};

/** The built web app: next to the bundled CLI, or apps/web/dist in the repository. */
export function webDir(): string {
  for (const d of [homePath("web"), homePath("apps", "web", "dist")]) if (existsSync(join(d, "index.html"))) return d;
  throw new ToolError("The web app is not built.", "In the repository, run: pnpm --filter @anivo/web build");
}

const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' https: http://localhost:* ws://127.0.0.1:*; worker-src 'self' blob:; frame-ancestors 'self'";

export async function serveWebApp(opts: { scene?: string; port: number; host?: string }): Promise<{ url: string; close(): void }> {
  const dir = webDir();
  const scenePath = opts.scene;
  if (scenePath) readSceneFile(scenePath); // check it before the server starts
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const headers = { "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
    if (url.pathname === "/local/scene" && scenePath) {
      // Read the file again on each request, so a reload shows the latest version.
      const bytes = packArchive(readSceneFile(scenePath), assetCache);
      res.writeHead(200, { ...headers, "content-type": "application/zip", "cache-control": "no-store", "x-anivo-name": encodeURIComponent(basename(scenePath)) });
      res.end(bytes);
      return;
    }
    if (url.pathname === "/config.js") {
      res.writeHead(200, { ...headers, "content-type": "text/javascript", "cache-control": "no-store" });
      res.end(`window.ANIVO_CONFIG = ${JSON.stringify({ serverUrl: process.env["ANIVO_SERVER_URL"] ?? "", aiProviders: "anthropic,openai,ollama", aiBaseUrl: "", telemetry: "off", disableExternal: false })};\n`);
      return;
    }
    let file = normalize(join(dir, decodeURIComponent(url.pathname)));
    if (file !== dir && !file.startsWith(dir + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html");
    res.writeHead(200, { ...headers, "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  const host = opts.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, host, () => resolve());
  });
  const port = (server.address() as { port: number }).port;
  return { url: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}/${scenePath ? "?scene=/local/scene" : ""}`, close: () => server.close() };
}
