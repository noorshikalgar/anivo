import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { startHttpServer } from "./http.js";

describe("anivo serve (MCP over Streamable HTTP)", () => {
  it("serves the tools with the bearer token, and refuses requests without it", async () => {
    const root = mkdtempSync(join(tmpdir(), "anivo-serve-"));
    const { server, url, token } = await startHttpServer({ root, port: 0 });
    try {
      const client = new Client({ name: "t", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain("anivo_script_apply");
      const r = (await client.callTool({ name: "anivo_script_apply", arguments: { scene: "a.anivo", script: 'box a "A"\nstep "S"\n  enter a fade\n' } })) as { isError?: boolean };
      expect(r.isError).toBeFalsy();
      await client.close();

      expect((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
      expect((await fetch(url, { method: "POST", headers: { authorization: "Bearer wrong", "content-type": "application/json" }, body: "{}" })).status).toBe(401);
      expect((await fetch(url.replace("/mcp", "/healthz"))).status).toBe(200);
    } finally {
      server.close();
    }
  });
});
