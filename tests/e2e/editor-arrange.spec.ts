import { expect, test } from "@playwright/test";
import { drag, openEditor, screen, state } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

async function selectPods(page: import("@playwright/test").Page) {
  await drag(page, await screen(page, 1150, 200), await screen(page, 1460, 880));
  expect((await state(page)).selection.sort()).toEqual(["pod-1", "pod-2", "pod-3"]);
}

test("Ctrl+G groups, a click selects the group, a drag moves all, Ctrl+Shift+G ungroups", async ({ page }) => {
  await selectPods(page);
  await page.keyboard.press("Control+g");
  let s = await state(page);
  expect(s.selection).toEqual(["group"]);
  expect(["pod-1", "pod-2", "pod-3"].map((id) => s.scene.elements[id]!.parentId)).toEqual(["group", "group", "group"]);

  await page.keyboard.press("Escape");
  const pod = s.scene.elements["pod-2"]!;
  const from = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(from.x, from.y);
  expect((await state(page)).selection).toEqual(["group"]);
  await drag(page, from, { x: from.x, y: from.y + 60 });
  s = await state(page);
  const dy = s.scene.elements["pod-1"]!.y - 240;
  expect(dy).toBeGreaterThan(0);
  expect(s.scene.elements["pod-3"]!.y - 750).toBe(dy);

  await page.keyboard.press("Control+Shift+g");
  s = await state(page);
  expect(s.scene.elements["group"]).toBeUndefined();
  expect(s.scene.elements["pod-1"]!.parentId).toBeUndefined();
});

test("copy and paste makes copies with new IDs and keeps connectors between them", async ({ page }) => {
  const lb = (await state(page)).scene.elements["lb"]!;
  await drag(page, await screen(page, 560, 200), await screen(page, 1460, 880));
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  // Paste reads the clipboard, which is asynchronous.
  await expect.poll(async () => (await state(page)).scene.elements["lb-2"] !== undefined).toBe(true);
  const s = await state(page);
  expect(s.scene.elements["lb-2"]).toMatchObject({ x: lb.x + 24, y: lb.y + 24 });
  const copy = s.scene.elements["c-lb-1-2"];
  expect(copy?.start).toMatchObject({ kind: "bound", elementId: "lb-2" });
  expect(copy?.end).toMatchObject({ kind: "bound", elementId: "pod-1-2" });
});

test("align left and distribute vertically", async ({ page }) => {
  await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { apply(tx: unknown): unknown; setSelection(ids: string[]): void } } }).__anivo.getState();
    st.apply({ ops: [{ op: "element.update", id: "pod-2", set: { x: 1300, y: 600 } }] });
    st.setSelection(["pod-1", "pod-2", "pod-3"]);
  });
  await page.getByRole("button", { name: "Align left" }).click();
  let s = await state(page);
  expect(new Set(["pod-1", "pod-2", "pod-3"].map((id) => s.scene.elements[id]!.x)).size).toBe(1);
  await page.getByRole("button", { name: "Distribute vertically" }).click();
  s = await state(page);
  const ys = ["pod-1", "pod-2", "pod-3"].map((id) => s.scene.elements[id]!.y);
  expect(ys[1]! - ys[0]!).toBeCloseTo(ys[2]! - ys[1]!, 5);
});
