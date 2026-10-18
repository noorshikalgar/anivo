import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createShareServer } from "../../apps/server/src/server.js";
import { EDITOR, openEditor, state } from "./helpers.js";

type S = { scene: { meta: { title: string }; elements: Record<string, unknown> } };

test("a share link opens the scene in another browser; the server sees only encrypted bytes", async ({ page, browser }) => {
  const dir = mkdtempSync(join(tmpdir(), "anivo-share-e2e-"));
  const server = createShareServer({ dir });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const config = `window.ANIVO_CONFIG = { serverUrl: "${serverUrl}", aiProviders: "", aiBaseUrl: "", telemetry: "off", disableExternal: false };`;
  try {
    await page.route("**/config.js", (r) => r.fulfill({ body: config, contentType: "text/javascript" }));
    await openEditor(page);
    await page.evaluate(() => (window as unknown as { __anivo: { getState(): { apply(tx: unknown): unknown } } }).__anivo.getState().apply({ ops: [{ op: "scene.meta", set: { title: "Secret plan" } }] }));
    await page.getByRole("button", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Share link…" }).click();
    const box = page.getByRole("textbox", { name: "Link" });
    await expect(box).toHaveValue(/#share=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    const link = await box.inputValue();
    // The stored file does not contain the scene in plain text.
    const files = readdirSync(dir).filter((f) => !f.endsWith(".del"));
    expect(files).toHaveLength(1);
    expect(readFileSync(join(dir, files[0]!)).includes(Buffer.from("Secret plan"))).toBe(false);

    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.addInitScript(() => localStorage.setItem("anivo.tourDone", "1"));
    await p2.route("**/config.js", (r) => r.fulfill({ body: config, contentType: "text/javascript" }));
    await p2.goto(link.replace(/^http:\/\/[^/]+\//, EDITOR));
    await expect.poll(async () => ((await state(p2)) as unknown as S).scene.meta.title).toBe("Secret plan");
    expect(new URL(p2.url()).hash).toBe("");
    await other.close();
  } finally {
    server.close();
  }
});
