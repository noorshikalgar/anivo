import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

test("with navigator.modelContext, the editor registers its tools and they change the scene", async ({ page }) => {
  await page.addInitScript(() => {
    const tools: Record<string, { execute(i: unknown): Promise<unknown> }> = {};
    (navigator as unknown as { modelContext: unknown }).modelContext = { registerTool: (t: { name: string; execute(i: unknown): Promise<unknown> }) => ((tools[t.name] = t), { unregister: () => delete tools[t.name] }) };
    (window as unknown as { __webmcp: unknown }).__webmcp = tools;
  });
  await openEditor(page);
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as { __webmcp: object }).__webmcp).length)).toBeGreaterThanOrEqual(8);
  const r = (await page.evaluate(() => (window as unknown as { __webmcp: Record<string, { execute(i: unknown): Promise<unknown> }> }).__webmcp["anivo_script_apply"]!.execute({ script: 'box web "From WebMCP" at=200,800' }))) as { content: { text: string }[] };
  expect(r.content[0]!.text).toContain("Applied");
  expect(((await state(page)) as unknown as { scene: { elements: Record<string, unknown> } }).scene.elements["web"]).toBeDefined();
});
