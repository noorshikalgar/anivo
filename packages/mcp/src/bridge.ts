/**
 * Bridge from the MCP server to the web editor (FR-AGENT-08, docs/09 "Bridge").
 *
 * The server listens on 127.0.0.1 only. The editor connects with a WebSocket and
 * sends a one-time pairing code in its first message. The code expires after
 * 5 minutes. The server checks the remote address and the Origin header.
 * After pairing, the server sends requests ("scene", "apply", "undo") and the
 * editor answers them.
 */
import { randomInt } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { type WebSocket, WebSocketServer } from "ws";

export const DEFAULT_BRIDGE_PORT = 47811;
const CODE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;

/** Web app origins that may connect. ANIVO_WEB_ORIGINS adds more (comma-separated). */
export function allowedOrigins(extra: string[] = []): string[] {
  const env = (process.env["ANIVO_WEB_ORIGINS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set(["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080", "http://127.0.0.1:8080", ...env, ...extra])];
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Checks of a new connection, before the pairing code. Returns an error text, or null if the connection may continue. */
export function checkConnection(remoteAddress: string | undefined, origin: string | undefined, origins: string[]): string | null {
  if (!remoteAddress || !LOOPBACK.has(remoteAddress)) return "Only this computer can connect.";
  if (!origin || !origins.includes(origin)) return `The origin '${origin ?? "(none)"}' may not connect. Add it with --origin.`;
  return null;
}

/** A pairing code such as 4821-0937. It is shown to the user, who types it in the editor. */
export function newPairingCode(): string {
  const n = () => String(randomInt(0, 10_000)).padStart(4, "0");
  return `${n()}-${n()}`;
}

export interface BridgeStatus {
  connected: boolean;
  port: number;
  /** The code to type in the editor, or null while an editor is connected. */
  code: string | null;
  codeExpiresAt: number | null;
}

export interface Bridge {
  /** Send a request to the editor and wait for the answer. */
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  status(): BridgeStatus;
  /** Make a new pairing code (the old one stops working). */
  renewCode(): string;
  close(): Promise<void>;
}

export interface BridgeOptions {
  port?: number;
  origins?: string[];
  /** For tests: the clock. */
  now?: () => number;
  /** Called with lines for the user (pairing code, connect, disconnect). */
  log?: (line: string) => void;
}

/** Close codes for a refused connection. */
export const CLOSE = { badCode: 4401, badOrigin: 4403, busy: 4409 } as const;

export async function startBridge(opts: BridgeOptions = {}): Promise<Bridge> {
  const now = opts.now ?? Date.now;
  const origins = opts.origins ?? allowedOrigins();
  const log = opts.log ?? (() => undefined);
  let code: string | null = null;
  let expires = 0;
  let editor: WebSocket | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: NodeJS.Timeout }>();

  const renewCode = () => {
    code = newPairingCode();
    expires = now() + CODE_TTL_MS;
    log(`Pairing code: ${code} (port ${port}). In the Anivo editor, click "Connect agent" and type it. It expires in 5 minutes.`);
    return code;
  };

  const wss = new WebSocketServer({ host: "127.0.0.1", port: opts.port ?? DEFAULT_BRIDGE_PORT, maxPayload: 64 * 1024 * 1024 });
  await new Promise<void>((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  const port = (wss.address() as { port: number }).port;

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const bad = checkConnection(req.socket.remoteAddress, req.headers.origin, origins);
    if (bad) {
      ws.close(CLOSE.badOrigin, bad);
      return;
    }
    let paired = false;
    // The first message must come soon and must hold the pairing code.
    const hello = setTimeout(() => !paired && ws.close(CLOSE.badCode, "No pairing code."), 10_000);
    ws.on("message", (data) => {
      let msg: { type?: string; code?: string; id?: number; result?: unknown; error?: string };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!paired) {
        clearTimeout(hello);
        if (msg.type !== "hello" || !code || msg.code !== code || now() > expires) {
          ws.close(CLOSE.badCode, now() > expires && code ? "The pairing code expired. Get a new code." : "The pairing code is not correct.");
          return;
        }
        if (editor) {
          ws.close(CLOSE.busy, "An editor is connected already.");
          return;
        }
        paired = true;
        editor = ws;
        code = null; // one-time
        ws.send(JSON.stringify({ type: "welcome" }));
        log("The editor is connected.");
        return;
      }
      if (msg.type === "response" && typeof msg.id === "number") {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      }
    });
    ws.on("close", () => {
      clearTimeout(hello);
      if (editor === ws) {
        editor = null;
        for (const p of pending.values()) {
          clearTimeout(p.timer);
          p.reject(new Error("The editor disconnected."));
        }
        pending.clear();
        log("The editor disconnected.");
        renewCode();
      }
    });
  });

  renewCode();

  return {
    request<T>(method: string, params?: unknown): Promise<T> {
      if (!editor) return Promise.reject(new Error(code ? `No editor is connected. Ask the user to click "Connect agent" in the Anivo editor and type the code ${code} (port ${port}).` : "No editor is connected."));
      const id = nextId++;
      const ws = editor;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("The editor did not answer in 30 seconds."));
        }, REQUEST_TIMEOUT_MS);
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        ws.send(JSON.stringify({ type: "request", id, method, params }));
      });
    },
    status: () => ({ connected: editor !== null, port, code, codeExpiresAt: code ? expires : null }),
    renewCode,
    close: () =>
      new Promise<void>((resolve) => {
        editor?.close();
        for (const c of wss.clients) c.terminate();
        wss.close(() => resolve());
      }),
  };
}
