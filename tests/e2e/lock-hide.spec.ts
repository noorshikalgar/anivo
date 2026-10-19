import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

type S = { scene: { elements: Record<string, { x: number; y: number; width: number; height: number; locked: boolean; editorHidden: boolean }> }; selection: string[] };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;
const center = async (page: import("@playwright/test").Page, id: string) => {
  const e = (await st(page)).scene.elements[id]!;
  return screen(page, e.x + e.width / 2, e.y + e.height / 2);
};

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("a locked element cannot be picked on the canvas; unlock all brings it back", async ({ page }) => {
  const p = await center(page, "pod-2");
  await page.mouse.click(p.x, p.y);
  expect((await st(page)).selection).toEqual(["pod-2"]);
  await page.getByLabel("Inspector").getByRole("button", { name: "Lock", exact: true }).click();
  expect((await st(page)).scene.elements["pod-2"]!.locked).toBe(true);
  await page.mouse.click(p.x, p.y);
  expect((await st(page)).selection).toEqual([]);
  await page.keyboard.press("Control+a");
  expect((await st(page)).selection).not.toContain("pod-2");
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Command", { exact: true })).toBeFocused();
  await page.keyboard.type("Unlock and show all");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await st(page)).scene.elements["pod-2"]!.locked).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection([]));
  await page.mouse.click(p.x, p.y);
  expect((await st(page)).selection).toEqual(["pod-2"]);
});

test("hidden in editor: the canvas does not draw it, the export does", async ({ page }) => {
  const p = await center(page, "lb");
  await page.mouse.click(p.x, p.y);
  const pixel = () =>
    page.evaluate(([x, y]) => {
      const c = document.querySelector<HTMLCanvasElement>("canvas[aria-label='Scene canvas']")!;
      const r = c.getBoundingClientRect();
      const d = c.getContext("2d")!.getImageData(Math.round(((x! - r.left) * c.width) / r.width), Math.round(((y! - r.top) * c.height) / r.height - 12), 1, 1).data;
      return d[0]! + d[1]! + d[2]!;
    }, [p.x, p.y]);
  const before = await pixel();
  await page.keyboard.press("Control+Shift+h");
  const s = await st(page);
  expect(s.scene.elements["lb"]!.editorHidden).toBe(true);
  expect(s.selection).toEqual([]);
  await expect.poll(pixel).not.toBe(before);
  await page.mouse.click(p.x, p.y);
  expect((await st(page)).selection).toEqual([]);
});
