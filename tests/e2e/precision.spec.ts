import { expect, test } from "@playwright/test";
import { drag, openEditor, screen, state } from "./helpers.js";

type S = { scene: { elements: Record<string, { x: number; y: number; width: number; height: number }> }; layout: { showGrid: boolean; gridSize: number; snapGrid: boolean }; areas: { left: number } };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("the grid shows, and a move snaps to the grid size of the Snap menu", async ({ page }) => {
  await page.getByRole("button", { name: "Show the grid" }).click();
  expect((await st(page)).layout.showGrid).toBe(true);
  await page.getByRole("button", { name: "Snap settings" }).click();
  await page.getByRole("menuitemradio", { name: "32 px" }).click();
  expect((await st(page)).layout.gridSize).toBe(32);
  const lb = (await st(page)).scene.elements["lb"]!;
  const from = await screen(page, lb.x + lb.width / 2, lb.y + lb.height / 2);
  await drag(page, from, { x: from.x + 37, y: from.y + 23 });
  const moved = (await st(page)).scene.elements["lb"]!;
  expect(moved.x % 32).toBe(0);
  expect(moved.y % 32).toBe(0);
  // The settings stay after a reload.
  await page.reload();
  await page.getByRole("heading", { name: "Your scenes" }).waitFor();
  expect((await st(page)).layout).toMatchObject({ showGrid: true, gridSize: 32 });
});

test("drag the edge of the steps area to resize it", async ({ page }) => {
  const handle = page.getByRole("separator", { name: "Resize the steps area" });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 63, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await st(page)).areas.left).toBeGreaterThan(270);
  await handle.dblclick();
  expect((await st(page)).areas.left).toBe(230);
});
