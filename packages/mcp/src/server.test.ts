import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createAnivoServer } from "./server.js";

const root = mkdtempSync(join(tmpdir(), "anivo-mcp-"));
let client: Client;

type Result = { content: { type: string; text?: string; data?: string }[]; isError?: boolean };
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as Result;
const textOf = (r: Result) => r.content.map((c) => c.text ?? "").join("\n");

beforeAll(async () => {
  const server = createAnivoServer({ root });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
});

const SCRIPT = `scene "MCP test"
box a "A"
box b "B" right-of=a
arrow a -> b
step "One"
  enter a, b pop
step "Two"
  flow a->b
`;

describe("Anivo MCP server", () => {
  it("lists all tools from docs/09", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ["anivo_contact_sheet", "anivo_export", "anivo_guide", "anivo_icons_search", "anivo_lint", "anivo_ops_apply", "anivo_preview", "anivo_scene_create", "anivo_scene_get", "anivo_scene_summary", "anivo_schema", "anivo_script_apply", "anivo_templates_list", "anivo_undo"].sort(),
    );
  });

  it("returns the guide", async () => {
    expect(textOf(await call("anivo_guide"))).toContain("Anivo Script quick reference");
  });

  it("applies a script, returns a lint summary, and gets the scene back as script", async () => {
    const r = await call("anivo_script_apply", { scene: "t.anivo", script: SCRIPT });
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toMatch(/Saved t\.anivo: 3 elements, 2 steps/);
    expect(textOf(r)).toMatch(/Lint: 0 errors/);
    expect(textOf(await call("anivo_scene_get", { scene: "t.anivo" }))).toMatch(/^scene "MCP test"/);
    expect(textOf(await call("anivo_scene_summary", { scene: "t.anivo" }))).toContain("Steps (2):");
  });

  it("reports script errors with line numbers and does not change the file", async () => {
    const r = await call("anivo_script_apply", { scene: "t.anivo", script: "box a\nbox a\n" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("line 2, column 5");
    expect(textOf(await call("anivo_scene_summary", { scene: "t.anivo" }))).toContain('"MCP test"');
  });

  it("applies operations and undoes them", async () => {
    const r = await call("anivo_ops_apply", { scene: "t.anivo", transaction: { ops: [{ op: "element.add", type: "rectangle", props: { label: "Extra", x: 100, y: 800, width: 200, height: 80 } }] } });
    expect(textOf(r)).toContain("New IDs: extra");
    const bad = await call("anivo_ops_apply", { scene: "t.anivo", transaction: { ops: [{ op: "element.update", id: "nope", set: {} }] } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("Use one of:");
    expect(textOf(await call("anivo_undo", { scene: "t.anivo" }))).toContain("Undid");
    expect(textOf(await call("anivo_scene_summary", { scene: "t.anivo" }))).not.toContain("extra");
  });

  it("returns preview and contact sheet images", async () => {
    const p = await call("anivo_preview", { scene: "t.anivo", step: 1, debug: true, width: 480 });
    expect(p.content[0]?.type).toBe("image");
    expect(Buffer.from(p.content[0]!.data!, "base64").subarray(1, 4).toString()).toBe("PNG");
    const c = await call("anivo_contact_sheet", { scene: "t.anivo" });
    expect(c.content[0]?.type).toBe("image");
  });

  it("creates a scene from a template and lists templates", async () => {
    expect(textOf(await call("anivo_templates_list"))).toContain("tcp-handshake");
    const r = await call("anivo_scene_create", { path: "tcp.anivo", template: "tcp-handshake", style: "sketch" });
    expect(textOf(r)).toContain("Made tcp.anivo.");
    expect(textOf(await call("anivo_scene_create", { path: "tcp.anivo" })).toString()).toContain("exists already");
  });

  it("searches icons and returns the JSON Schema", async () => {
    expect(textOf(await call("anivo_icons_search", { query: "database", limit: 2 }))).toBe("lucide:database\nfluent:database");
    expect(JSON.parse(textOf(await call("anivo_schema", { kind: "ops" }))).type).toBe("object");
  });

  it("refuses paths outside the root, including through a symbolic link", async () => {
    const outside = mkdtempSync(join(tmpdir(), "anivo-outside-"));
    writeFileSync(join(outside, "x.anivo.txt"), "box a\n");
    mkdirSync(join(root, "sub"), { recursive: true });
    symlinkSync(outside, join(root, "sub", "link"));
    for (const scene of ["../evil.anivo", "/etc/passwd.json", "sub/link/x.anivo"]) {
      const r = await call("anivo_script_apply", { scene, script: SCRIPT });
      expect(r.isError, scene).toBe(true);
      expect(textOf(r)).toMatch(/outside the scene folder|does not exist/);
    }
    expect(existsSync(join(outside, "x.anivo"))).toBe(false);
  });

  it("exports an MP4 and does not overwrite without permission", async () => {
    const r = await call("anivo_export", { scene: "t.anivo", out: "t.mp4", size: "320x180", fps: 24 });
    expect(textOf(r), textOf(r)).toMatch(/Exported t\.mp4/);
    const again = await call("anivo_export", { scene: "t.anivo", out: "t.mp4" });
    expect(textOf(again)).toContain("exists already");
  }, 60_000);

  it("has the guide and schema resources and the explain-concept prompt", async () => {
    const res = (await client.listResources()).resources.map((r) => r.uri).sort();
    expect(res).toEqual(["anivo://guide", "anivo://schema/ops", "anivo://schema/scene"]);
    const p = await client.getPrompt({ name: "explain-concept", arguments: { topic: "DNS" } });
    expect(JSON.stringify(p.messages)).toContain("DNS");
  });
});
