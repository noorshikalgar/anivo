/**
 * The optional Anivo server (docs/11 "Image 2"): storage for share links (FR-SHARE-01).
 *
 * The editor encrypts the scene in the browser (AES-GCM). The key is in the URL
 * fragment, which the browser never sends. The server stores and returns only
 * encrypted bytes. It cannot read the scenes.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { join } from "node:path";

export interface ShareServerOptions {
  /** Folder for the encrypted files. */
  dir: string;
  /** Origins that may upload (CORS). "*" allows all. */
  origins?: string[];
  /** Maximum size of one share in bytes. Default 64 MB. */
  maxBytes?: number;
  /** Shares older than this are deleted. Default 30 days. */
  ttlMs?: number;
  /** Uploads for each client address in each hour. Default 60. */
  uploadsPerHour?: number;
  /** API tokens for uploads (docs/11 WARNING). Empty: no token needed. */
  tokens?: string[];
  now?: () => number;
}

const ID = /^[A-Za-z0-9_-]{22}$/;
const sha = (s: string) => createHash("sha256").update(s).digest();

export function createShareServer(opts: ShareServerOptions): Server & { cleanup(): number } {
  const now = opts.now ?? Date.now;
  const maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
  const ttl = opts.ttlMs ?? 30 * 24 * 3600 * 1000;
  const perHour = opts.uploadsPerHour ?? 60;
  const origins = opts.origins ?? ["*"];
  const tokens = (opts.tokens ?? []).filter(Boolean).map(sha);
  const uploads = new Map<string, number[]>();
  mkdirSync(opts.dir, { recursive: true });

  const cors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (origin && (origins.includes("*") || origins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origins.includes("*") ? "*" : origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-delete-token");
      res.setHeader("Access-Control-Max-Age", "600");
    }
  };
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const allowedUpload = (req: IncomingMessage): string | null => {
    if (tokens.length) {
      const t = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
      if (!t || !tokens.some((x) => timingSafeEqual(x, sha(t)))) return "A valid API token is needed.";
    }
    const origin = req.headers.origin;
    if (origin && !origins.includes("*") && !origins.includes(origin)) return "This origin may not upload.";
    const ip = req.socket.remoteAddress ?? "?";
    const list = (uploads.get(ip) ?? []).filter((t) => t > now() - 3600_000);
    if (list.length >= perHour) return "Too many uploads. Try again later.";
    list.push(now());
    uploads.set(ip, list);
    return null;
  };

  const server = createServer((req, res) => {
    cors(req, res);
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/healthz") return json(res, 200, { ok: true });

    if (url.pathname === "/api/shares" && req.method === "POST") {
      const refused = allowedUpload(req);
      if (refused) return json(res, refused.startsWith("Too many") ? 429 : 403, { error: refused });
      const declared = Number(req.headers["content-length"] ?? 0);
      if (declared > maxBytes) return json(res, 413, { error: "The scene is too large." });
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          json(res, 413, { error: "The scene is too large." });
          req.destroy();
        } else chunks.push(c);
      });
      req.on("end", () => {
        if (res.writableEnded) return;
        if (size < 13) return json(res, 400, { error: "The body is empty." });
        const id = randomBytes(16).toString("base64url");
        const deleteToken = randomBytes(24).toString("base64url");
        writeFileSync(join(opts.dir, id), Buffer.concat(chunks));
        writeFileSync(join(opts.dir, `${id}.del`), sha(deleteToken).toString("hex"));
        json(res, 201, { id, deleteToken });
      });
      return;
    }

    const m = /^\/api\/shares\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const id = m[1]!;
      const file = join(opts.dir, id);
      if (!ID.test(id) || !existsSync(file)) return json(res, 404, { error: "The share does not exist or expired." });
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "private, max-age=3600" });
        res.end(readFileSync(file));
        return;
      }
      if (req.method === "DELETE") {
        const token = String(req.headers["x-delete-token"] ?? "");
        const stored = Buffer.from(readFileSync(`${file}.del`, "utf8"), "hex");
        if (!token || !timingSafeEqual(stored, sha(token))) return json(res, 403, { error: "The delete token is not correct." });
        rmSync(file, { force: true });
        rmSync(`${file}.del`, { force: true });
        return json(res, 200, { ok: true });
      }
    }
    json(res, 404, { error: "Not found." });
  }) as Server & { cleanup(): number };

  /** Delete expired shares. Returns how many. */
  server.cleanup = () => {
    let n = 0;
    for (const f of readdirSync(opts.dir)) {
      if (!ID.test(f)) continue;
      if (statSync(join(opts.dir, f)).mtimeMs < now() - ttl) {
        rmSync(join(opts.dir, f), { force: true });
        rmSync(join(opts.dir, `${f}.del`), { force: true });
        n++;
      }
    }
    return n;
  };
  return server;
}
