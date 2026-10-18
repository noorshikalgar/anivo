import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { type Bridge, CLOSE, checkConnection, startBridge } from "./bridge.js";

const ORIGIN = "http://localhost:5173";
let bridge: Bridge | null = null;
afterEach(async () => {
  await bridge?.close();
  bridge = null;
});

/** Connect, send hello with a code, and return the first answer or the close code. */
function connect(port: number, code: string, origin = ORIGIN): Promise<{ ws: WebSocket; welcome: boolean; close?: number; reason?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", code })));
    ws.on("message", (d) => JSON.parse(String(d)).type === "welcome" && resolve({ ws, welcome: true }));
    ws.on("close", (c, r) => resolve({ ws, welcome: false, close: c, reason: String(r) }));
  });
}

describe("bridge security (docs/12)", () => {
  it("accepts the right code one time, then answers requests", async () => {
    bridge = await startBridge({ port: 0 });
    const { port, code } = bridge.status();
    const a = await connect(port, code!);
    expect(a.welcome).toBe(true);
    expect(bridge.status()).toMatchObject({ connected: true, code: null });
    a.ws.on("message", (d) => {
      const m = JSON.parse(String(d));
      if (m.type === "request") a.ws.send(JSON.stringify({ type: "response", id: m.id, result: { echo: m.method } }));
    });
    expect(await bridge.request("scene")).toEqual({ echo: "scene" });
    // The used code does not work again.
    const b = await connect(port, code!);
    expect(b).toMatchObject({ welcome: false, close: CLOSE.badCode });
    a.ws.close();
  });

  it("refuses a wrong pairing code", async () => {
    bridge = await startBridge({ port: 0 });
    const r = await connect(bridge.status().port, "0000-0000");
    expect(r).toMatchObject({ welcome: false, close: CLOSE.badCode, reason: "The pairing code is not correct." });
  });

  it("refuses a wrong origin", async () => {
    bridge = await startBridge({ port: 0 });
    const r = await connect(bridge.status().port, bridge.status().code!, "https://evil.example");
    expect(r).toMatchObject({ welcome: false, close: CLOSE.badOrigin });
  });

  it("refuses an expired code", async () => {
    let t = 1_000_000;
    bridge = await startBridge({ port: 0, now: () => t });
    const code = bridge.status().code!;
    t += 5 * 60 * 1000 + 1;
    const r = await connect(bridge.status().port, code);
    expect(r).toMatchObject({ welcome: false, close: CLOSE.badCode, reason: "The pairing code expired. Get a new code." });
  });

  it("refuses a remote address and a missing origin", () => {
    expect(checkConnection("10.0.0.5", ORIGIN, [ORIGIN])).toBe("Only this computer can connect.");
    expect(checkConnection("192.168.1.2", ORIGIN, [ORIGIN])).not.toBeNull();
    expect(checkConnection("::1", undefined, [ORIGIN])).toMatch(/origin/);
    expect(checkConnection("::ffff:127.0.0.1", ORIGIN, [ORIGIN])).toBeNull();
  });

  it("a request without an editor tells the agent the pairing code", async () => {
    bridge = await startBridge({ port: 0 });
    await expect(bridge.request("scene")).rejects.toThrow(new RegExp(`type the code ${bridge.status().code}`));
  });

  it("makes a new code when the editor disconnects", async () => {
    bridge = await startBridge({ port: 0 });
    const first = bridge.status().code!;
    const a = await connect(bridge.status().port, first);
    a.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(bridge.status().connected).toBe(false);
    expect(bridge.status().code).not.toBe(first);
  });
});
