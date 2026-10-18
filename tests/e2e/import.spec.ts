import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

type S = { scene: { meta: { title: string }; elements: Record<string, { type: string }>; steps: unknown[] } };

test("File > Import opens a Mermaid flowchart as a new scene with steps", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "File" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import Excalidraw or Mermaid…" }).click();
  await (await chooser).setFiles({ name: "checkout.mmd", mimeType: "text/plain", buffer: Buffer.from("flowchart LR\n  cart[Cart] --> pay{Pay?}\n  pay -->|yes| ok[Done]\n  pay -->|no| cart\n") });
  await expect.poll(async () => ((await state(page)) as unknown as S).scene.meta.title).toBe("checkout");
  const s = (await state(page)) as unknown as S;
  expect(s.scene.elements["pay"]!.type).toBe("diamond");
  expect(s.scene.steps.length).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole("button", { name: /Layer 2/ })).toBeVisible();
});
