import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

type El = { type: string; parentId?: string; x: number; y: number; width: number; height: number; rows?: number; cols?: number; content?: { text: string } };
type S = { scene: { elements: Record<string, El> }; selection: string[] };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("insert table adds a 3 by 3 table with header cells, and a cell edits on double-click", async ({ page }) => {
  await page.getByRole("button", { name: "Insert table" }).click();
  let s = await st(page);
  const id = s.selection[0]!;
  expect(s.scene.elements[id]).toMatchObject({ type: "table", rows: 3, cols: 3 });
  expect(s.scene.elements[`${id}-r1c2`]!.content!.text).toBe("Column 2");
  const cell = s.scene.elements[`${id}-r2c1`]!;
  const p = await screen(page, cell.x + cell.width / 2, cell.y + cell.height / 2);
  await page.mouse.dblclick(p.x, p.y);
  await page.keyboard.type("Ana");
  await page.keyboard.press("Enter");
  s = await st(page);
  expect(s.scene.elements[`${id}-r2c1`]!.content!.text).toBe("Ana");
});

test("the inspector adds a row, and moving the table moves its cells", async ({ page }) => {
  await page.getByRole("button", { name: "Insert table" }).click();
  const id = (await st(page)).selection[0]!;
  const rows = page.getByLabel("Inspector").getByRole("spinbutton", { name: "Rows" });
  await rows.fill("4");
  await rows.press("Enter");
  let s = await st(page);
  expect(s.scene.elements[id]!.rows).toBe(4);
  expect(s.scene.elements[`${id}-r4c3`]).toBeDefined();
  const before = s.scene.elements[`${id}-r1c1`]!;
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Shift+ArrowRight");
  s = await st(page);
  expect(s.scene.elements[`${id}-r1c1`]!.x).toBeGreaterThan(before.x);
  expect(s.scene.elements[id]!.x - s.scene.elements[`${id}-r1c1`]!.x).toBe(0);
});
