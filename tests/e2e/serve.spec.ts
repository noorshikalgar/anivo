import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { serveWebApp } from "../../packages/cli/src/serve.js";
import { state } from "./helpers.js";

test.beforeAll(() => {
  // Build the web app now, so the test serves the current code.
  execSync("pnpm --filter @anivo/web build", { stdio: "ignore", timeout: 180_000 });
});

test("anivo serve opens a scene file in the built web app", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "anivo-serve-"));
  const scene = join(dir, "flow.anivo.json");
  writeFileSync(scene, JSON.stringify({ schemaVersion: 1, meta: { title: "Served scene" }, elements: { a: { type: "rectangle", z: "a0", x: 100, y: 100, width: 200, height: 100 } } }));
  const s = await serveWebApp({ scene, port: 0 });
  try {
    await page.addInitScript(() => localStorage.setItem("anivo.tourDone", "1"));
    const res = await page.goto(s.url);
    expect(res?.headers()["content-security-policy"]).toContain("default-src 'self'");
    await expect.poll(async () => ((await state(page)) as unknown as { scene: { meta: { title: string } } }).scene.meta.title).toBe("Served scene").catch(async () => {
      // Production builds do not expose the store; read the title in the top bar.
      await expect(page.getByText("Served scene").first()).toBeVisible();
    });
    await expect(page.getByText(/flow\.anivo\.json/)).toBeVisible();
    expect((await page.request.get(s.url.replace(/\?.*$/, "../../etc/passwd"))).status()).not.toBe(500);
  } finally {
    s.close();
  }
});
