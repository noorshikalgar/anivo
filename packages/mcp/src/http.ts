/**
 * `anivo serve`: the MCP server over Streamable HTTP (FR-AGENT-03), for agents
 * that connect with HTTP. Each request needs the bearer token. The server listens
 * on 127.0.0.1 by default and checks the Host header (DNS rebinding).
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type Server, createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAnivoServer } from "./server.js";

export interface HttpServerOptions {
  root: string;
  port?: number;
  host?: string;
  /** The bearer token. Default: a new random token. */
  token?: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

export async function startHttpServer(opts: HttpServerOptions): Promise<{ server: Server; url: string; token: string }> {
  const token = opts.token ?? randomBytes(24).toString("base64url");
  const want = sha(token);
  const host = opts.host ?? "127.0.0.1";
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const authorized = (req: IncomingMessage) => {
    const t = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    return !!t && timingSafeEqual(sha(t), want);
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://x");
      if (url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
        return;
      }
      if (url.pathname !== "/mcp") {
        res.writeHead(404).end();
        return;
      }
      if (!authorized(req)) {
        res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" }).end('{"error":"A valid bearer token is needed."}');
        return;
      }
      const sid = req.headers["mcp-session-id"];
      let transport = typeof sid === "string" ? sessions.get(sid) : undefined;
      if (!transport) {
        if (req.method !== "POST" || sid) {
          res.writeHead(404, { "content-type": "application/json" }).end('{"error":"The session does not exist."}');
          return;
        }
        const port = (server.address() as { port: number }).port;
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => void sessions.set(id, transport!),
          enableDnsRebindingProtection: host === "127.0.0.1" || host === "localhost",
          allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
        });
        transport.onclose = () => {
          if (transport!.sessionId) sessions.delete(transport!.sessionId);
        };
        await createAnivoServer({ root: opts.root }).connect(transport);
      }
      await transport.handleRequest(req, res);
    })().catch((err: unknown) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 8765, host, () => resolve());
  });
  const port = (server.address() as { port: number }).port;
  return { server, url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/mcp`, token };
}
