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

test("W opens the speaker notes window, and it follows the steps", async ({ page }) => {
  await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { scene: { steps: { id: string }[] }; apply(tx: unknown): unknown } } }).__anivo.getState();
    st.apply({ label: "Notes", ops: [{ op: "step.update", id: st.scene.steps[0]!.id, set: { notes: "Say hello first." } }] });
  });
  await page.getByRole("button", { name: "Present" }).click();
  await expect(page.getByRole("dialog", { name: "Present mode" })).toBeVisible();
  const popup = page.waitForEvent("popup");
  await page.keyboard.press("w");
  const notes = await popup;
  await expect(notes.locator("#step")).toHaveText("Start");
  await expect(notes.locator("#next")).toHaveText("Next: User appears");
  await page.keyboard.press("ArrowRight");
  await expect(notes.locator("#notes")).toHaveText("Say hello first.");
  await expect(notes.locator("#step")).toHaveText("Step 1 of 4");
  // The buttons in the notes window move the presentation.
  await notes.locator("#nextBtn").click();
  await notes.locator("#nextBtn").click();
  await expect(notes.locator("#step")).toHaveText("Step 2 of 4");
  await page.keyboard.press("Escape");
  await expect.poll(() => notes.isClosed()).toBe(true);
});
