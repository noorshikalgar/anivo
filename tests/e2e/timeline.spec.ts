import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

type S = { scene: { steps: { id: string; actions: { id: string; delayMs: number; durationMs?: number }[] }[] }; selectedStep: string | null; playhead: number };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Show the timeline" }).click();
});

test("the timeline shows a track for each action", async ({ page }) => {
  const s = await st(page);
  const count = s.scene.steps.reduce((n, x) => n + x.actions.length, 0);
  await expect(page.getByRole("region", { name: "Timeline" }).getByRole("slider")).toHaveCount(count);
});

test("drag a bar to change the delay, drag its end to change the duration", async ({ page }) => {
  const bar = page.getByRole("slider", { name: /in step 2/ }).first();
  const before = (await st(page)).scene.steps[1]!.actions[0]!;
  let box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const moved = (await st(page)).scene.steps[1]!.actions[0]!;
  expect(moved.delayMs).toBeGreaterThan(before.delayMs + 100);

  box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const longer = (await st(page)).scene.steps[1]!.actions[0]!;
  expect(longer.durationMs).toBeGreaterThan(300);
  expect(longer.delayMs).toBe(moved.delayMs);
  // Both changes undo.
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  expect((await st(page)).scene.steps[1]!.actions[0]!.delayMs).toBe(before.delayMs);
});

test("click a bar to select its step, click the ruler to move the playhead", async ({ page }) => {
  await page.getByRole("slider", { name: /in step 3/ }).first().click();
  const s = await st(page);
  expect(s.selectedStep).toBe(s.scene.steps[2]!.id);
  const ruler = page.getByLabel("Time ruler");
  const box = (await ruler.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect((await st(page)).playhead).toBeGreaterThan(1000);
});

test("the Layers view shows when each element is on the screen, and its in time can change", async ({ page }) => {
  await page.getByRole("tab", { name: "Layers" }).click();
  const inLb = page.getByRole("slider", { name: "In time of lb" });
  await expect(inLb).toHaveCount(1);
  type A = { id: string; delayMs: number; targets: string[]; type: string };
  const enterLb = async () => ((await st(page)).scene.steps.flatMap((x) => x.actions) as unknown as A[]).find((a) => a.type === "enter" && a.targets.includes("lb"))!;
  const before = await enterLb();
  await inLb.focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect((await enterLb()).delayMs).toBe(before.delayMs + 500);
});
