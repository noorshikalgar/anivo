import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

test("move along the selected arrow adds a motion path from the arrow route", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: /Load balancer/ }).first().click();
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["user", "c-user-lb"]));
  await page.getByLabel("Inspector").getByRole("button", { name: "Add action" }).click();
  await page.getByRole("menuitem", { name: "Move along the selected arrow" }).click();
  const s = (await state(page)) as unknown as { scene: { steps: { actions: { type: string; targets: string[]; motion?: { points: unknown[] } }[] }[] } };
  const a = s.scene.steps[1]!.actions.find((x) => x.type === "motion")!;
  expect(a.targets).toEqual(["user"]);
  expect(a.motion!.points.length).toBeGreaterThanOrEqual(2);
});
