import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("autosave keeps the scene in the library after a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Template: How a load balancer works" }).click();
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
  const before = (await state(page)).scene.steps.length;
  await page.keyboard.press("n");
  await expect.poll(async () => (await state(page)).scene.steps.length).toBe(before + 1);
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByRole("button", { name: "Open How a load balancer works" }).click();
  await page.getByRole("navigation", { name: "Steps" }).waitFor();
  expect((await state(page)).scene.steps).toHaveLength(before + 1);
});

test("New scene starts an empty scene", async ({ page }) => {
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "New scene" }).click();
  const s = await state(page);
  expect(Object.keys(s.scene.elements)).toHaveLength(0);
  expect(s.scene.steps).toHaveLength(0);
});

test("Save as writes an archive, and Open reads a JSON scene", async ({ page }) => {
  // Replace the browser file pickers with fakes that keep the data in the page.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w["__saved"] = null;
    w["showSaveFilePicker"] = async () => ({
      name: "demo.anivo",
      getFile: async () => new File([], "demo.anivo"),
      createWritable: async () => ({
        write: async (data: Uint8Array) => {
          w["__saved"] = Array.from(data.slice(0, 2));
        },
        close: async () => undefined,
      }),
    });
    const json = JSON.stringify({ schemaVersion: 1, meta: { title: "From disk" }, elements: { box: { type: "rectangle", z: "a0", x: 10, y: 10, width: 100, height: 50 } } });
    w["showOpenFilePicker"] = async () => [{ name: "disk.json", getFile: async () => new File([json], "disk.json") }];
  });
  await page.keyboard.press("Control+Shift+s");
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>)["__saved"])).toEqual([0x50, 0x4b]);
  await expect(page.getByText("· demo.anivo")).toBeVisible();

  await page.keyboard.press("Control+o");
  await expect.poll(async () => (await state(page)).scene.meta.title).toBe("From disk");
  expect(Object.keys((await state(page)).scene.elements)).toEqual(["box"]);
});

test("Open shows an error for a file that is not a scene", async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>)["showOpenFilePicker"] = async () => [{ name: "bad.json", getFile: async () => new File(["{ nope"], "bad.json") }];
  });
  await page.keyboard.press("Control+o");
  await expect(page.getByText(/is not a valid Anivo scene/).first()).toBeVisible();
});
