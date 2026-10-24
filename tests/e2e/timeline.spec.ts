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

test("time keys: arrows step one frame (Shift ten), Home and End", async ({ page }) => {
  const ruler = page.getByLabel("Time ruler");
  const box = (await ruler.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.75);
  const t0 = (await st(page)).playhead;
  await page.keyboard.press("ArrowRight");
  expect((await st(page)).playhead).toBeCloseTo(t0 + 1000 / 60, 1);
  await page.keyboard.press("Shift+ArrowLeft");
  expect((await st(page)).playhead).toBeCloseTo(t0 + 1000 / 60 - 10000 / 60, 1);
  await page.keyboard.press("Home");
  expect((await st(page)).playhead).toBe(0);
  await page.keyboard.press("End");
  expect((await st(page)).playhead).toBeGreaterThan(5000);
});

test("a dragged block snaps to the playhead", async ({ page }) => {
  type A = { id: string; type: string; targets: string[]; delayMs: number };
  const s0 = (await state(page)) as unknown as { scene: { steps: { id: string; actions: A[] }[] }; timeline: { totalMs: number; steps: { id: string; startMs: number }[] } };
  const enter = s0.scene.steps[1]!.actions.find((a) => a.type === "enter" && a.targets.includes("lb"))!;
  const t = s0.timeline.steps[1]!.startMs + 400;
  await page.evaluate((ms) => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ playhead: ms, pinStepEnd: false }), t);
  const block = page.getByRole("group", { name: "Track lb" }).locator(`[data-action="${enter.id}"]`);
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  const ruler = (await page.getByLabel("Time ruler").boundingBox())!;
  const span = Math.max(1000, s0.timeline.totalMs + 3000);
  // Drop the block start 3 px from the playhead: it snaps.
  const target = ruler.x + (t / span) * ruler.width + 3;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const s1 = (await state(page)) as unknown as typeof s0;
  expect(s1.scene.steps[1]!.actions.find((a) => a.id === enter.id)!.delayMs).toBe(400);
});

test("track filter: only animated, only selected", async ({ page }) => {
  const timeline = page.getByRole("region", { name: "Timeline" });
  const all = await timeline.getByRole("group", { name: /^Track / }).count();
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { apply(t: unknown): unknown } } }).__anivo.getState().apply({ label: "Add", ops: [{ op: "element.add", id: "still", type: "rectangle", props: { x: 10, y: 10, width: 50, height: 50 } }] }));
  await expect(timeline.getByRole("group", { name: /^Track / })).toHaveCount(all + 1);
  await page.getByRole("button", { name: "Animated", exact: true }).click();
  await expect(timeline.getByRole("group", { name: "Track still" })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["lb"]));
  await page.getByRole("button", { name: "Selected", exact: true }).click();
  await expect(timeline.getByRole("group", { name: /^Track / })).toHaveCount(1);
});

test("Alt + drag on the ruler sets a loop region; play goes round in it", async ({ page }) => {
  const ruler = page.getByLabel("Time ruler");
  const box = (await ruler.boundingBox())!;
  const y = box.y + box.height * 0.75;
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const loop = (await state(page)) as unknown as { loop: { fromMs: number; toMs: number } | null };
  expect(loop.loop).not.toBeNull();
  const { fromMs, toMs } = loop.loop!;
  await page.getByRole("button", { name: /^Play/ }).click();
  await page.waitForTimeout((toMs - fromMs) * 1.5);
  const p = (await st(page)).playhead;
  expect(p).toBeGreaterThanOrEqual(fromMs - 1);
  expect(p).toBeLessThan(toMs + 1);
  await page.getByRole("button", { name: "Clear the loop region" }).click();
  expect(((await state(page)) as unknown as { loop: unknown }).loop).toBeNull();
});

test("drop a bar at the end of another bar: it chains, and moves when the first bar moves (docs/21 C7)", async ({ page }) => {
  await page.evaluate(() => {
    const s = (window as unknown as { __anivo: { getState(): { apply(t: unknown): unknown; selectStep(id: string): void } } }).__anivo.getState();
    s.apply({
      label: "t",
      ops: [
        { op: "step.add", id: "chain", props: { title: "Chain", actions: [
          { id: "first", type: "enter", effect: "fade", targets: ["lb"], durationMs: 800 },
          { id: "second", type: "enter", effect: "fade", targets: ["user"], delayMs: 2000, durationMs: 600 },
        ] } },
      ],
    });
    s.selectStep("chain");
  });
  const first = page.locator('[data-action="first"]').first();
  const second = page.locator('[data-action="second"]').first();
  await second.scrollIntoViewIfNeeded();
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width + 12, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  type A = { id: string; delayMs: number; after?: string };
  const acts = async () => (await page.evaluate(() => (window as unknown as { __anivo: { getState(): { scene: { steps: { id: string; actions: unknown[] }[] } } } }).__anivo.getState().scene.steps.find((x) => x.id === "chain")!.actions)) as A[];
  expect((await acts())[1]).toMatchObject({ after: "first", delayMs: 0 });
  await expect(second).toHaveAttribute("data-action", "second");
  await expect(page.locator('[data-action="second"] [data-chain]').first()).toBeAttached();
  // Move the first bar: the chained bar moves with it.
  // A tooltip of the bar that moved can cover the first bar: move away until it closes.
  await page.mouse.move(2, 2);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const f = (await first.boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2 + 60, f.y + f.height / 2, { steps: 6 });
  await page.mouse.up();
  expect((await acts())[0]!.delayMs).toBeGreaterThan(100);
  // The view can zoom out (the step is longer): check that the second bar starts at the end of the first bar.
  const f2 = (await first.boundingBox())!;
  expect(Math.abs((await second.boundingBox())!.x - (f2.x + f2.width))).toBeLessThan(3);
  expect((await acts())[1]).toMatchObject({ after: "first", delayMs: 0 });
});

test("shuttle keys: L plays, L again is faster, J plays backward; comma and period step one frame (docs/22 D3)", async ({ page }) => {
  type P = { playhead: number; playing: boolean; rate: number };
  const p = async () => (await state(page)) as unknown as P;
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ playhead: 2000 }));
  await page.keyboard.press("Period");
  expect((await p()).playhead).toBeCloseTo(2000 + 1000 / 60, 1);
  await page.keyboard.press("Shift+Comma");
  expect((await p()).playhead).toBeCloseTo(2000 + 1000 / 60 - 10000 / 60, 1);
  await page.keyboard.press("l");
  await page.keyboard.press("l");
  expect(await p()).toMatchObject({ playing: true, rate: 2 });
  await page.keyboard.press("j");
  expect((await p()).rate).toBe(-1);
  const t = (await p()).playhead;
  await page.waitForTimeout(300);
  expect((await p()).playhead).toBeLessThan(t);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await p()).playing).toBe(false);
});

test("point at the ruler: a small frame of that time shows; the playhead does not move (docs/22 D1)", async ({ page }) => {
  const ruler = page.getByLabel("Time ruler");
  const box = (await ruler.boundingBox())!;
  const before = ((await state(page)) as unknown as { playhead: number }).playhead;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2);
  await expect(page.locator("[data-scrub-preview]")).toBeVisible();
  expect(((await state(page)) as unknown as { playhead: number }).playhead).toBe(before);
  await page.mouse.move(box.x + box.width * 0.45, box.y + 400);
  await expect(page.locator("[data-scrub-preview]")).toHaveCount(0);
});
