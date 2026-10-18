import { mkdtempSync, utimesSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ShareServerOptions, createShareServer } from "./server.js";

let close: (() => void) | null = null;
afterEach(() => close?.());

async function start(o: Partial<ShareServerOptions> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "anivo-share-"));
  const server = createShareServer({ dir, ...o });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  close = () => server.close();
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, dir };
}

const blob = new Uint8Array(64).map((_, i) => i);

describe("share server (FR-SHARE-01)", () => {
  it("stores and returns encrypted bytes, and deletes with the token", async () => {
    const { url } = await start();
    const r = await fetch(`${url}/api/shares`, { method: "POST", body: blob, headers: { "content-type": "application/octet-stream" } });
    expect(r.status).toBe(201);
    const { id, deleteToken } = (await r.json()) as { id: string; deleteToken: string };
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const g = await fetch(`${url}/api/shares/${id}`);
    expect(new Uint8Array(await g.arrayBuffer())).toEqual(blob);
    expect((await fetch(`${url}/api/shares/${id}`, { method: "DELETE", headers: { "x-delete-token": "wrong" } })).status).toBe(403);
    expect((await fetch(`${url}/api/shares/${id}`, { method: "DELETE", headers: { "x-delete-token": deleteToken } })).status).toBe(200);
    expect((await fetch(`${url}/api/shares/${id}`)).status).toBe(404);
  });

  it("refuses big bodies, bad IDs, other origins, and too many uploads", async () => {
    const { url } = await start({ maxBytes: 100, origins: ["http://localhost:8080"], uploadsPerHour: 2 });
    expect((await fetch(`${url}/api/shares`, { method: "POST", body: new Uint8Array(200) })).status).toBe(413);
    expect((await fetch(`${url}/api/shares/..%2Fetc%2Fpasswd`)).status).toBe(404);
    expect((await fetch(`${url}/api/shares`, { method: "POST", body: blob, headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${url}/api/shares`, { method: "POST", body: blob, headers: { origin: "http://localhost:8080" } })).status).toBe(201);
    expect((await fetch(`${url}/api/shares`, { method: "POST", body: blob })).status).toBe(429);
  });

  it("needs an API token when tokens are set", async () => {
    const { url } = await start({ tokens: ["secret-1"] });
    expect((await fetch(`${url}/api/shares`, { method: "POST", body: blob })).status).toBe(403);
    expect((await fetch(`${url}/api/shares`, { method: "POST", body: blob, headers: { authorization: "Bearer secret-1" } })).status).toBe(201);
  });

  it("deletes expired shares", async () => {
    const { url, server, dir } = await start({ ttlMs: 1000 });
    const { id } = (await (await fetch(`${url}/api/shares`, { method: "POST", body: blob })).json()) as { id: string };
    const old = (Date.now() - 5000) / 1000;
    utimesSync(join(dir, id), old, old);
    expect(server.cleanup()).toBe(1);
    expect((await fetch(`${url}/api/shares/${id}`)).status).toBe(404);
  });

  it("answers CORS preflight and health", async () => {
    const { url } = await start();
    const r = await fetch(`${url}/api/shares`, { method: "OPTIONS", headers: { origin: "http://localhost:5173" } });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(await (await fetch(`${url}/healthz`)).json()).toEqual({ ok: true });
  });
});
