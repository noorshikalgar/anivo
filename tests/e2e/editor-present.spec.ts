import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

const presenting = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __anivo: { getState(): { presenting: boolean } } }).__anivo.getState().presenting);

test("present mode steps forward and back, and Escape exits", async ({ page }) => {
  await page.getByRole("button", { name: "Present" }).click();
  const present = page.getByRole("dialog", { name: "Present mode" });
  await expect(present).toBeVisible();
  await expect(present.getByText(/^Start/)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(present.getByText(/Step 1 of 4/)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(present.getByText(/Step 2 of 4/)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(present.getByText(/Step 1 of 4/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(present).toBeHidden();
  expect(await presenting(page)).toBe(false);
});

test("F5 starts present mode, and a click advances", async ({ page }) => {
  await page.keyboard.press("F5");
  const present = page.getByRole("dialog", { name: "Present mode" });
  await expect(present).toBeVisible();
  await present.click();
  await expect(present.getByText(/Step 1 of 4/)).toBeVisible();
  // The editor scene does not change in present mode.
  expect((await state(page)).scene.steps).toHaveLength(4);
});
