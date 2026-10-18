import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

test("add an icon pack from a folder of SVG files, and it stays after a reload", async ({ page }) => {
  const dir = join(mkdtempSync(join(tmpdir(), "anivo-pack-")), "acme");
  mkdirSync(dir);
  writeFileSync(join(dir, "Widget.svg"), '<svg viewBox="0 0 24 24" fill="none" stroke="black"><circle cx="12" cy="12" r="8"/></svg>');
  writeFileSync(join(dir, "Gear.svg"), '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg>');
  await openEditor(page);
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setIconPicker(p: unknown): void } } }).__anivo.getState().setIconPicker({ x: 900, y: 500 }));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add icon pack (folder of SVG files)…" }).click();
  await (await chooser).setFiles(dir);
  await expect(page.getByRole("tab", { name: "acme" })).toBeVisible();
  await page.getByRole("option", { name: "widget" }).click();
  const s = (await state(page)) as unknown as { scene: { elements: Record<string, { type: string; pack?: string; name?: string }> } };
  expect(Object.values(s.scene.elements).some((e) => e.type === "icon" && e.pack === "acme" && e.name === "widget")).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Blank Landscape 16:9" }).click();
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setIconPicker(p: unknown): void } } }).__anivo.getState().setIconPicker({ x: 900, y: 500 }));
  await expect(page.getByRole("tab", { name: "acme" })).toBeVisible();
});
