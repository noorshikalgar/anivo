import { expect, test } from "@playwright/test";
import { openEditor, openHome, state } from "./helpers.js";

const noSideScroll = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("the home screen fits a phone", async ({ page }) => {
  await openHome(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("button", { name: "New scene" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search scenes and templates" })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});

test("on a phone, the panels are drawers and the video fits the screen", async ({ page }) => {
  await openEditor(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("navigation", { name: "Steps" })).not.toBeInViewport();
  for (const name of ["Home", "Export", "Properties", "Steps"]) await expect(page.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
  expect(await noSideScroll(page)).toBe(true);
  // The video fits the new width.
  await expect.poll(async () => (await state(page)).view.zoom * 960).toBeLessThan(375);

  await page.getByRole("button", { name: "Steps", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Steps" })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Steps" })).not.toBeInViewport();

  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeInViewport();
});

test("a wide window shows the panels beside the canvas", async ({ page }) => {
  await openEditor(page);
  await expect(page.getByRole("navigation", { name: "Steps" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Properties", exact: true })).toHaveCount(0);
});
