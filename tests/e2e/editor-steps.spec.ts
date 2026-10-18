import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

const stepIds = async (page: Parameters<typeof state>[0]) => (await state(page)).scene.steps.map((s) => s.id);

test("Add step adds a step after the selected step and selects it", async ({ page }) => {
  await page.getByRole("button", { name: /Load balancer/ }).first().click();
  await page.getByRole("button", { name: "Add step" }).click();
  const s = await state(page);
  expect(s.scene.steps).toHaveLength(5);
  expect(s.scene.steps[2]!.title).toBe("Step 5");
  expect(s.selectedStep).toBe(s.scene.steps[2]!.id);
  await expect(page.getByLabel("Inspector").getByText("Step", { exact: true })).toBeVisible();
});

test("Add action adds an enter action for the selected element", async ({ page }) => {
  await page.getByRole("button", { name: "Add step" }).click();
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByRole("menuitem", { name: "Emphasis" }).click();
  await page.getByRole("menuitem", { name: "Pulse" }).click();
  const s = await state(page);
  const step = s.scene.steps.find((st) => st.id === s.selectedStep)!;
  expect(step.actions).toEqual([expect.objectContaining({ type: "emphasis", effect: "pulse", targets: ["pod-2"] })]);
});

test("the action editor changes the duration", async ({ page }) => {
  await page.getByRole("button", { name: /User appears/ }).click();
  await page.getByRole("button", { name: /Enter · draw-on/ }).click();
  const field = page.getByRole("spinbutton", { name: "Duration (ms)" });
  await field.fill("1200");
  await field.press("Enter");
  const step = (await state(page)).scene.steps[0]!;
  expect(step.actions[0]!.durationMs).toBe(1200);
});

test("the step menu duplicates and deletes a step", async ({ page }) => {
  await page.getByRole("button", { name: "More for step 2" }).click({ force: true });
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  expect(await stepIds(page)).toHaveLength(5);
  const s = await state(page);
  expect(s.scene.steps[2]!.title).toBe("Load balancer (copy)");
  expect(s.scene.steps[2]!.actions).toHaveLength(2);
  await page.getByRole("button", { name: "More for step 3" }).click({ force: true });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  expect(await stepIds(page)).toEqual(["s-user", "s-lb", "s-pods", "s-traffic"]);
});

test("N adds a step", async ({ page }) => {
  await page.keyboard.press("n");
  expect(await stepIds(page)).toHaveLength(5);
});

test("Add action adds a camera zoom to the selection", async ({ page }) => {
  await page.getByRole("button", { name: "Add step" }).click();
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["pod-1", "pod-2"]));
  await page.getByRole("button", { name: "Add action" }).first().click();
  await page.getByRole("menuitem", { name: "Camera: zoom to selection" }).click();
  const s = await state(page);
  const step = s.scene.steps.find((st) => st.id === s.selectedStep)!;
  expect(step.actions[0]).toMatchObject({ type: "camera", targets: ["pod-1", "pod-2"] });
});
