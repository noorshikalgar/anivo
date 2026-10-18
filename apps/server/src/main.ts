/** Start the optional Anivo server from environment variables (docs/11). */
import { fileURLToPath } from "node:url";
import { createShareServer } from "./server.js";

const storage = process.env["ANIVO_STORAGE"] ?? "file:///data";
if (!storage.startsWith("file://")) throw new Error("ANIVO_STORAGE supports file:// only now. Example: file:///data");
const port = Number(process.env["PORT"] ?? 8081);
const server = createShareServer({
  dir: fileURLToPath(storage),
  origins: (process.env["ANIVO_ALLOWED_ORIGINS"] ?? "*").split(",").map((s) => s.trim()).filter(Boolean),
  tokens: (process.env["ANIVO_API_TOKENS"] ?? "").split(",").map((s) => s.trim()),
  ttlMs: Number(process.env["ANIVO_SHARE_TTL_DAYS"] ?? 30) * 24 * 3600 * 1000,
  maxBytes: Number(process.env["ANIVO_MAX_SHARE_MB"] ?? 64) * 1024 * 1024,
});
server.cleanup();
setInterval(() => server.cleanup(), 3600_000).unref();
server.listen(port, () => console.log(`Anivo server on port ${port}. Storage: ${storage}`));
