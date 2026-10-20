import { expect, test } from "@playwright/test";
import { openHome, state } from "./helpers.js";

test("a template opens in the editor, and the scene shows on the home screen", async ({ page }) => {
  await openHome(page);
  await expect(page.getByText("No scenes yet.")).toBeVisible();
  await page.getByRole("button", { name: "Template: TCP three-way handshake" }).click();
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
  await page.getByRole("button", { name: "Home" }).click();
  const scenes = page.getByRole("list", { name: "Your scenes" });
  await expect(scenes.getByRole("article", { name: "TCP three-way handshake" })).toBeVisible();
  // The scene opens again with the same content.
  await scenes.getByRole("button", { name: "Open TCP three-way handshake" }).click();
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
  expect((await state(page)).scene.meta.title).toBe("TCP three-way handshake");
});

test("a new vertical scene is 1080 x 1920", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "New scene" }).click();
  await page.getByRole("menuitem", { name: /Vertical 9:16/ }).click();
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
  const s = (await state(page)) as unknown as { scene: { settings: { video: { width: number; height: number } } } };
  expect(s.scene.settings.video).toMatchObject({ width: 1080, height: 1920 });
});

test("rename, duplicate, search, and delete a scene", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Template: Docker image layers" }).click();
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
  await page.getByRole("button", { name: "Home" }).click();
  const scenes = page.getByRole("list", { name: "Your scenes" });
  await scenes.getByRole("button", { name: "More actions for Docker image layers" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Scene name" }).fill("My layers");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(scenes.getByRole("article", { name: "My layers" })).toBeVisible();

  await scenes.getByRole("button", { name: "More actions for My layers" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(scenes.getByRole("article", { name: "My layers (copy)" })).toBeVisible();

  await page.getByRole("textbox", { name: "Search scenes and templates" }).fill("copy");
  await expect(scenes.getByRole("article")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search scenes and templates" }).fill("");

  await scenes.getByRole("button", { name: "More actions for My layers (copy)" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete scene" }).getByRole("button", { name: "Delete" }).click();
  await expect(scenes.getByRole("article")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("list", { name: "Your scenes" }).getByRole("article", { name: "My layers" })).toBeVisible();
});

test("the template row scrolls with its arrows", async ({ page }) => {
  await openHome(page);
  const row = page.getByRole("list", { name: "Templates" });
  await expect(page.getByRole("button", { name: "Scroll the templates left" })).toHaveCount(0);
  await page.getByRole("button", { name: "Scroll the templates right" }).click();
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await expect(page.getByRole("button", { name: "Scroll the templates left" })).toBeVisible();
});
