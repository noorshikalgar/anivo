import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openEditor } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press("Control+e");
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
});

async function exportAndRead(page: import("@playwright/test").Page): Promise<{ name: string; bytes: Buffer }> {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Export", exact: true }).click();
  const d = await download;
  const path = await d.path();
  return { name: d.suggestedFilename(), bytes: readFileSync(path) };
}

async function choose(page: import("@playwright/test").Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test("exports an MP4 of a step range", async ({ page }) => {
  await choose(page, "Size", /960 × 540/);
  await choose(page, "Frame rate", "24 fps");
  await choose(page, "To step", /2\. Load balancer/);
  await expect(page.getByText("2.7 s of video")).toBeVisible();
  const { name, bytes } = await exportAndRead(page);
  expect(name).toBe("how-a-load-balancer-works.mp4");
  expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
  await expect(page.getByRole("dialog", { name: "Export" })).toBeHidden();
});

test("exports a GIF with a size estimate", async ({ page }) => {
  await page.getByRole("radio", { name: "GIF" }).check();
  await choose(page, "Width", "480 px");
  await choose(page, "To step", /1\. User appears/);
  await expect(page.getByText(/s of video · about [\d.]+ MB/)).toBeVisible();
  const { name, bytes } = await exportAndRead(page);
  expect(name).toBe("how-a-load-balancer-works.gif");
  expect(bytes.subarray(0, 6).toString()).toBe("GIF89a");
});

test("exports a PNG of each step in a ZIP file", async ({ page }) => {
  await page.getByRole("radio", { name: "PNG of each step" }).check();
  await choose(page, "Size", /960 × 540/);
  const { name, bytes } = await exportAndRead(page);
  expect(name).toBe("how-a-load-balancer-works-steps.zip");
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
});

test("cancel stops an export", async ({ page }) => {
  await choose(page, "Size", /3840 × 2160/);
  await page.getByRole("dialog").getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("button", { name: /Exporting/ })).toBeVisible();
  let downloaded = false;
  page.on("download", () => (downloaded = true));
  const t0 = Date.now();
  await page.getByRole("button", { name: "Cancel export" }).click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeHidden();
  expect(Date.now() - t0).toBeLessThan(1500);
  await page.waitForTimeout(1500);
  expect(downloaded).toBe(false);
});

test("exports an SVG of each step in a ZIP file", async ({ page }) => {
  await page.getByRole("radio", { name: "SVG of each step" }).check();
  const { name, bytes } = await exportAndRead(page);
  expect(name).toMatch(/-steps-svg\.zip$/);
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(bytes));
  const names = Object.keys(files).sort();
  expect(names.length).toBe(4);
  const svg = strFromU8(files[names[1]!]!);
  expect(svg).toMatch(/^<svg xmlns/);
  expect(svg).toContain("@font-face{font-family:'Inter'");
  expect(svg).toContain("Load balancer");
});
