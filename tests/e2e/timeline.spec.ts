import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

type S = { scene: { steps: { id: string; actions: { id: string; delayMs: number; durationMs?: number }[] }[] }; selectedStep: string | null; playhead: number };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Show the timeline" }).click();
});

test("the timeline has one track for each element, and steps as sections on the ruler", async ({ page }) => {
  const s = (await state(page)) as unknown as S & { scene: { elements: Record<string, { type: string }> } };
  const count = Object.values(s.scene.elements).filter((e) => e.type !== "group").length;
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByRole("group", { name: /^Track / })).toHaveCount(count);
  await expect(timeline.getByRole("button", { name: /^Step section \d+$/ })).toHaveCount(s.scene.steps.length);
  await timeline.getByRole("button", { name: "Step section 3" }).click();
  expect((await st(page)).selectedStep).toBe(s.scene.steps[2]!.id);
});

test("drag a bar to change the delay, drag its end to change the duration", async ({ page }) => {
  const before = (await st(page)).scene.steps[1]!.actions[0]!;
  const bar = page.locator(`[data-action="${before.id}"]`).first();
  await bar.scrollIntoViewIfNeeded();
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

test("the enter block of an element is its in time: arrow keys move it", async ({ page }) => {
  type A = { id: string; delayMs: number; targets: string[]; type: string };
  const enterLb = async () => ((await st(page)).scene.steps.flatMap((x) => x.actions) as unknown as A[]).find((a) => a.type === "enter" && a.targets.includes("lb"))!;
  const before = await enterLb();
  const block = page.getByRole("group", { name: "Track lb" }).locator(`[data-action="${before.id}"]`);
  await block.focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect((await enterLb()).delayMs).toBe(before.delayMs + 500);
});

test("zoom in and out, and Fit", async ({ page }) => {
  const ruler = page.getByLabel("Time ruler");
  const w0 = (await ruler.boundingBox())!.width;
  await page.getByRole("button", { name: "Zoom in the timeline" }).click();
  expect((await ruler.boundingBox())!.width).toBeGreaterThan(w0 * 1.4);
  await page.getByRole("button", { name: "Fit the timeline" }).click();
  expect((await ruler.boundingBox())!.width).toBeCloseTo(w0, 0);
});

test("drag a block into another step: the action moves to that step, and one undo moves it back", async ({ page }) => {
  type A = { id: string; type: string; targets: string[] };
  const s0 = (await state(page)) as unknown as { scene: { steps: { id: string; actions: A[] }[] }; timeline: { totalMs: number; steps: { id: string; startMs: number }[] } };
  const enter = s0.scene.steps[1]!.actions.find((a) => a.type === "enter" && a.targets.includes("lb"))!;
  const block = page.getByRole("group", { name: "Track lb" }).locator(`[data-action="${enter.id}"]`);
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  const ruler = (await page.getByLabel("Time ruler").boundingBox())!;
  const span = Math.max(1000, s0.timeline.totalMs + 3000);
  const step4 = s0.timeline.steps[3]!;
  // From the block start to 0.5 s into step 4.
  const targetX = ruler.x + ((step4.startMs + 500) / span) * ruler.width;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move((box.x + targetX) / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(targetX, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const s1 = (await state(page)) as unknown as typeof s0 & { selectedStep: string };
  expect(s1.scene.steps[1]!.actions.some((a) => a.id === enter.id)).toBe(false);
  expect(s1.scene.steps[3]!.actions.some((a) => a.id === enter.id)).toBe(true);
  expect(s1.selectedStep).toBe(step4.id);
  await page.keyboard.press("Control+z");
  const s2 = (await state(page)) as unknown as typeof s0;
  expect(s2.scene.steps[1]!.actions.some((a) => a.id === enter.id)).toBe(true);
});
