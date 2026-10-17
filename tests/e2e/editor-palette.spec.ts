import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

test("Ctrl+K opens the command palette, and Enter runs the command", async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Command", { exact: true })).toBeFocused();
  await page.keyboard.type("theme paper");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await state(page)).scene.settings.theme).toBe("paper-light");
});

test("arrow keys choose a command", async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("style");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await state(page)).scene.settings.style).toBe("sketch");
});
