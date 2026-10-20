import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

type S = { scene: { elements: Record<string, { type: string; parentId?: string }> }; selection: string[] };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;

test("insert a built-in widget, save it as my widget, and insert my widget", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Widgets" }).click();
  await page.getByRole("button", { name: "Insert Stat card" }).click();
  let s = await st(page);
  expect(s.selection).toEqual(["stat"]);
  expect(Object.values(s.scene.elements).filter((e) => e.parentId === "stat")).toHaveLength(3);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save as widget…" }).click();
  await page.getByRole("textbox", { name: "Widget name" }).fill("KPI");
  await page.getByRole("dialog", { name: "Save as widget" }).getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Widgets" }).click();
  await page.getByRole("button", { name: "Insert my widget KPI" }).click();
  s = await st(page);
  expect(s.selection).toHaveLength(1);
  expect(s.selection[0]).not.toBe("stat");
  expect(Object.values(s.scene.elements).filter((e) => e.parentId === s.selection[0])).toHaveLength(3);
});
