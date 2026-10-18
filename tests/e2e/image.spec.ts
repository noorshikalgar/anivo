import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

type S = { scene: { elements: Record<string, { type: string; assetId?: string; width: number; height: number; fit?: string }>; assets: Record<string, { mime: string }> }; selection: string[] };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;

/** A 300x150 SVG with a red fill. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#ff0000"/></svg>`;

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("insert image adds an image element with its asset, sized to the image ratio", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Insert image" }).click();
  await (await chooser).setFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SVG) });
  await expect.poll(async () => (await st(page)).selection.length).toBe(1);
  const s = await st(page);
  const el = s.scene.elements[s.selection[0]!]!;
  expect(el).toMatchObject({ type: "image", width: 300, height: 150, fit: "contain" });
  expect(s.scene.assets[el.assetId!]!.mime).toBe("image/svg+xml");
  // The canvas draws the image: a red pixel at its center.
  const box = (await page.getByTestId("canvas-root").boundingBox())!;
  const view = (await state(page)).view;
  const e = s.scene.elements[s.selection[0]!] as unknown as { x: number; y: number };
  const cx = box.x + (e.x + 150 - view.x) * view.zoom;
  const cy = box.y + (e.y + 75 - view.y) * view.zoom;
  await expect
    .poll(async () => page.evaluate(([x, y]) => {
      const c = document.querySelector<HTMLCanvasElement>("canvas[aria-label='Scene canvas']")!;
      const r = c.getBoundingClientRect();
      const d = c.getContext("2d")!.getImageData(Math.round(((x! - r.left) * c.width) / r.width), Math.round(((y! - r.top) * c.height) / r.height), 1, 1).data;
      return [d[0], d[1], d[2]];
    }, [cx, cy]))
    .toEqual([255, 0, 0]);
});

test("the inspector changes the fit, and the file type is checked", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Insert image" }).click();
  await (await chooser).setFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SVG) });
  await page.getByLabel("Inspector").getByRole("combobox", { name: "Fit" }).click();
  await page.getByRole("option", { name: "Cover (fill and cut)" }).click();
  const s = await st(page);
  expect(s.scene.elements[s.selection[0]!]!.fit).toBe("cover");

  const chooser2 = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Insert image" }).click();
  await (await chooser2).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText(/Use a PNG, JPEG, WebP, or SVG file/).first()).toBeVisible();
});
