import { expect, test } from "@playwright/test";
import { EDITOR } from "./helpers.js";

test("the first-run tour has 5 screens, and it does not show again", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto(EDITOR);
  const tour = page.getByRole("dialog", { name: "Tour" });
  await expect(tour).toBeVisible();
  await expect(tour.getByText("Welcome to Anivo")).toBeVisible();
  for (let i = 0; i < 4; i++) await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour.getByRole("img", { name: "Screen 5 of 5" })).toBeVisible();
  await tour.getByRole("button", { name: "Start" }).click();
  await expect(tour).toHaveCount(0);
  await page.reload();
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog", { name: "Tour" })).toHaveCount(0);
});

test("Skip closes the tour", async ({ page }) => {
  await page.goto(EDITOR);
  await page.getByRole("dialog", { name: "Tour" }).getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("dialog", { name: "Tour" })).toHaveCount(0);
});
