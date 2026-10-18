import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

type S = { scene: { settings: { theme: string; customTheme?: { name: string; base: string; tokens: Record<string, string> } } } };

test("the theme editor makes a custom theme, and the canvas uses it", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Edit custom theme…" }).click();
  const dlg = page.getByRole("dialog", { name: "Theme editor" });
  await dlg.getByRole("textbox", { name: "Name" }).fill("brand");
  await dlg.getByLabel("background", { exact: true }).fill("#336699");
  await dlg.getByRole("button", { name: "Use theme" }).click();
  const s = (await state(page)) as unknown as S;
  expect(s.scene.settings.theme).toBe("brand");
  expect(s.scene.settings.customTheme).toMatchObject({ name: "brand", base: "slate-dark", tokens: { background: "#336699" } });
  // The canvas background inside the video frame uses the new color.
  const px = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("canvas[aria-label='Scene canvas']")!;
    const d = c.getContext("2d")!.getImageData(Math.round(c.width / 2), Math.round(c.height * 0.25), 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  expect(px).toEqual([0x33, 0x66, 0x99]);
  await expect(page.getByLabel("Inspector").getByRole("combobox", { name: "Theme" })).toHaveText(/brand \(custom\)/);
});
