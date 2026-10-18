import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "@playwright/test";
import { type Bridge, createAttachServer, startBridge } from "../../packages/mcp/src/index.js";
import { openEditor, state } from "./helpers.js";

type S = { scene: { elements: Record<string, { type: string; x: number }> }; agent: { status: string; review: boolean; pending: unknown[] } | null };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;

let bridge: Bridge;
let mcp: Client;

test.beforeEach(async ({ page }) => {
  bridge = await startBridge({ port: 0, origins: ["http://localhost:5173"] });
  const server = createAttachServer(bridge);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  mcp = new Client({ name: "test-agent", version: "1.0.0" });
  await mcp.connect(b);
  await openEditor(page);
});

test.afterEach(async () => {
  await mcp.close();
  await bridge.close();
});

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await mcp.callTool({ name, arguments: args })) as { content: { text?: string }[]; isError?: boolean };
  return { text: r.content.map((c) => c.text ?? "").join("\n"), error: r.isError === true };
};

async function pair(page: import("@playwright/test").Page) {
  const status = await call("anivo_bridge_status");
  const code = /code (\d{4}-\d{4})/.exec(status.text)![1]!;
  await page.getByRole("button", { name: "Connect agent" }).click();
  await page.getByRole("textbox", { name: "Port" }).fill(String(bridge.status().port));
  await page.getByRole("textbox", { name: "Pairing code" }).fill(code);
  await page.getByRole("dialog", { name: "Connect agent" }).getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("region", { name: "Agent" })).toBeVisible();
}

test("Journey 4: the agent edits the live scene; the user reviews each change", async ({ page }) => {
  expect((await call("anivo_scene_summary")).text).toMatch(/No editor is connected/);
  await pair(page);
  expect((await call("anivo_bridge_status")).text).toBe("The editor is connected.");
  expect((await call("anivo_scene_summary")).text).toContain("lb");

  // Review mode is on: the change waits.
  const r = await call("anivo_script_apply", { script: 'box cache "Cache" at=300,800\nstep "Cache"\n  enter cache pop\n' });
  expect(r.text).toContain("waits for the user's review");
  expect((await st(page)).scene.elements["cache"]).toBeUndefined();
  await page.getByRole("button", { name: "Accept Agent: add to the scene" }).click();
  expect((await st(page)).scene.elements["cache"]!.type).toBe("rectangle");

  // A rejected change does not apply and does not go into the undo history.
  await call("anivo_ops_apply", { transaction: { label: "Move cache", ops: [{ op: "element.update", id: "cache", set: { x: 900 } }] } });
  await page.getByRole("button", { name: "Reject Move cache" }).click();
  expect((await st(page)).scene.elements["cache"]!.x).toBe(300);
  await page.keyboard.press("Control+z");
  expect((await st(page)).scene.elements["cache"]).toBeUndefined();
  await page.keyboard.press("Control+Shift+z");

  // Review off: changes apply at once, and the user can edit at the same time.
  await page.getByRole("switch", { name: "Review agent changes" }).click();
  const direct = await call("anivo_ops_apply", { transaction: { label: "Move cache", ops: [{ op: "element.update", id: "cache", set: { x: 1000 } }] } });
  expect(direct.text).toContain("Applied 1 operations.");
  expect((await st(page)).scene.elements["cache"]!.x).toBe(1000);

  // The agent's tools see the live scene.
  const lint = await call("anivo_lint");
  expect(lint.error).toBe(false);
  const sheet = (await mcp.callTool({ name: "anivo_contact_sheet", arguments: {} })) as { content: { type: string }[] };
  expect(sheet.content[0]!.type).toBe("image");

  await page.getByRole("region", { name: "Agent" }).getByRole("button", { name: "Disconnect" }).click();
  await expect.poll(() => bridge.status().connected).toBe(false);
  expect((await call("anivo_bridge_status")).text).toMatch(/code \d{4}-\d{4}/);
});

test("a wrong pairing code shows an error in the editor", async ({ page }) => {
  await page.getByRole("button", { name: "Connect agent" }).click();
  await page.getByRole("textbox", { name: "Port" }).fill(String(bridge.status().port));
  await page.getByRole("textbox", { name: "Pairing code" }).fill("0000-0000");
  await page.getByRole("dialog", { name: "Connect agent" }).getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("The pairing code is not correct.")).toBeVisible();
  expect((await st(page)).agent).toBeNull();
});
