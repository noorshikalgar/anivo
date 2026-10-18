import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

test("the templates gallery shows 10 templates with pictures and opens one", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "New from template…" }).click();
  const gallery = page.getByRole("dialog", { name: "Templates" });
  await expect(gallery.getByRole("button")).toHaveCount(10);
  await page.screenshot({ path: "test-results/templates-gallery.png" });
  await gallery.getByRole("button", { name: /Git branch and merge/ }).click();
  await expect.poll(async () => ((await state(page)) as unknown as { scene: { meta: { title: string } } }).scene.meta.title).toBe("Git branch and merge");
  await expect(gallery).toHaveCount(0);
});
