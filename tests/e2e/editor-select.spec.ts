import { expect, test } from "@playwright/test";
import { drag, openEditor, screen, state } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("drag moves an element in the base state, and undo restores it", async ({ page }) => {
  const before = (await state(page)).scene.elements["lb"]!;
  const from = await screen(page, before.x + before.width / 2, before.y + before.height / 2);
  await drag(page, from, { x: from.x + 80, y: from.y + 60 });
  const after = (await state(page)).scene.elements["lb"]!;
  expect(after.x).not.toBe(before.x);
  expect(after.y).not.toBe(before.y);
  expect(after.x % 8).toBe(0);
  expect((await state(page)).selection).toEqual(["lb"]);
  await page.keyboard.press("Control+z");
  expect((await state(page)).scene.elements["lb"]).toMatchObject({ x: before.x, y: before.y });
});

test("drag in a step records a morph for an element that is already visible", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  const lb = (await state(page)).scene.elements["lb"]!;
  const from = await screen(page, lb.x + lb.width / 2, lb.y + lb.height / 2);
  await drag(page, from, { x: from.x, y: from.y + 100 });
  const s = await state(page);
  expect(s.scene.elements["lb"]!.y).toBe(lb.y);
  const step = s.scene.steps.find((st) => st.id === "s-traffic")!;
  const morph = step.actions.find((a) => a.type === "morph");
  expect(morph?.targets).toEqual(["lb"]);
  expect(morph?.to?.["y"]).toBeGreaterThan(lb.y);
});

test("marquee selects the elements inside the rectangle", async ({ page }) => {
  const a = await screen(page, 1150, 200);
  const b = await screen(page, 1460, 880);
  await drag(page, a, b);
  expect((await state(page)).selection.sort()).toEqual(["pod-1", "pod-2", "pod-3"]);
});

test("resize handle changes the size", async ({ page }) => {
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const center = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(center.x, center.y);
  const corner = await screen(page, pod.x + pod.width, pod.y + pod.height);
  await drag(page, corner, { x: corner.x + 60, y: corner.y + 30 });
  const after = (await state(page)).scene.elements["pod-2"]!;
  expect(after.width).toBeGreaterThan(pod.width);
  expect(after.height).toBeGreaterThan(pod.height);
});

test("Delete removes the selection and Ctrl+D duplicates it", async ({ page }) => {
  const pod = (await state(page)).scene.elements["pod-3"]!;
  const center = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(center.x, center.y);
  await page.keyboard.press("Control+d");
  const dup = (await state(page)).selection[0]!;
  expect(dup).not.toBe("pod-3");
  expect((await state(page)).scene.elements[dup]).toMatchObject({ x: pod.x + 24, y: pod.y + 24 });
  await page.keyboard.press("Delete");
  expect((await state(page)).scene.elements[dup]).toBeUndefined();
});
