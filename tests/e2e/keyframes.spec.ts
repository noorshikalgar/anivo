import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

/** Click the ruler at a time from the start of the selected step (the ruler goes 3 s past the end). */
const seek = async (page: import("@playwright/test").Page, stepRel: number) => {
  const ruler = page.getByLabel("Time ruler");
  const box = (await ruler.boundingBox())!;
  const { at, span } = await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { timeline: { totalMs: number; steps: { id: string; startMs: number }[] }; selectedStep: string } } }).__anivo.getState();
    const s = st.timeline.steps.find((x) => x.id === st.selectedStep)!;
    return { at: s.startMs, span: Math.max(10000, st.timeline.totalMs + 3000) };
  });
  // The lower half of the ruler: the upper half has the step sections.
  await page.mouse.click(box.x + ((at + stepRel) / span) * box.width, box.y + box.height * 0.75);
  // The ruler gives focus to the timeline (its arrow keys step frames). These tests nudge the selection next, as after a click on the canvas.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
};

type K = { t: number; v: number | string; ease?: unknown };
/** The element keys of an element (docs/32). */
const keysOf = async (page: import("@playwright/test").Page, id: string) => ((await state(page)).scene.elements[id] as unknown as { keys?: Record<string, K[]> }).keys ?? {};
const stepStart = async (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { timeline: { steps: { id: string; startMs: number }[] }; selectedStep: string } } }).__anivo.getState();
    return st.timeline.steps.find((x) => x.id === st.selectedStep)!.startMs;
  });

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("auto-key: moves at two times make two keyframes, and the Keys view edits them", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("k");
  expect((await state(page) as unknown as { autoKey: boolean }).autoKey).toBe(true);
  await expect(page.getByRole("button", { name: "Record keyframes" })).toHaveAttribute("aria-pressed", "true");

  const pod = (await state(page)).scene.elements["pod-2"]!;
  // Select pod-2, then move it at 1 s and at 2 s of the step.
  await seek(page, 1000);
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("Shift+ArrowRight");
  // The step is now 1 s long: 2 s is in the ruler (1.25 × the step).
  await seek(page, 1240);
  await page.keyboard.press("Shift+ArrowDown");

  const t0 = await stepStart(page);
  const k = await keysOf(page, "pod-2");
  // x: from the step start (the old place) to 1 s; y: from the step start to about 1.24 s.
  expect(k.x!.map((x) => x.t)).toEqual([t0, expect.any(Number)]);
  expect(Math.abs(k.x![1]!.t - (t0 + 1000))).toBeLessThan(60);
  expect(k.y).toHaveLength(2);

  const keys = page.getByRole("slider", { name: /Keyframe Position of pod-2/ });
  await expect(keys).toHaveCount(3);
  // Arrow keys move a keyframe on the video time; Delete removes it.
  await keys.nth(1).focus();
  await page.keyboard.press("ArrowRight");
  expect((await keysOf(page, "pod-2")).x![1]!.t).toBe(k.x![1]!.t + 100);
  await keys.nth(1).focus();
  await page.keyboard.press("Delete");
  await expect(keys).toHaveCount(2);
});

test("a key goes to the very start of the video: drag it to 0, and it stays there (docs/32)", async ({ page }) => {
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ playhead: 1500 }));
  await page.keyboard.press("i");
  const key = page.getByRole("slider", { name: /Keyframe Position of pod-2/ });
  await expect(key).toHaveCount(1);
  await key.scrollIntoViewIfNeeded();
  const b = (await key.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 400, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  expect((await keysOf(page, "pod-2")).x![0]!.t).toBe(0);
});

test("invisible at the start, then it comes in: opacity 0 at 0 s, 100 at 1 s (docs/32)", async ({ page }) => {
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ playhead: 0, autoKey: true, selectedStep: null }));
  await page.getByRole("button", { name: "Element", exact: true }).click();
  const opacity = page.getByRole("spinbutton", { name: "Opacity" });
  await opacity.fill("0");
  await opacity.press("Enter");
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ playhead: 1000 }));
  await opacity.fill("100");
  await opacity.press("Enter");
  const k = await keysOf(page, "pod-2");
  expect(k.opacity!.map((x) => [x.t, x.v])).toEqual([
    [0, 0],
    [1000, 1],
  ]);
  // At 0 s the panel and the canvas agree: opacity 0.
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ playhead: 0 }));
  await expect(opacity).toHaveValue("0%");
});

test("the keyframe button of a property adds and removes a keyframe at the playhead", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await page.getByRole("button", { name: "Add step" }).click();
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Element", exact: true }).click();
  const button = page.locator('[data-key-group="position"]');
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  // The timeline opens on the Keys view.
  await expect(page.getByRole("slider", { name: /Keyframe Position of pod-2/ })).toHaveCount(1);
  await button.click();
  await expect(page.getByRole("slider", { name: /Keyframe Position of pod-2/ })).toHaveCount(0);
});

test("a property with a keyframe records the next change at the playhead, with Record off", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await page.getByRole("button", { name: "Add step" }).click();
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Element", exact: true }).click();
  // The ◆ of Position: a key at the playhead (the start of the empty step).
  await page.locator('[data-key-group="position"]').click();
  await seek(page, 1000);
  // The timeline opened, so the canvas moved: find pod-2 again.
  const p2 = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p2.x, p2.y);
  await page.keyboard.press("Shift+ArrowRight");
  const s = await state(page);
  expect((await keysOf(page, "pod-2")).x).toHaveLength(2);
  expect(s.scene.elements["pod-2"]!.x).toBe(pod.x);
});

test("the motion path shows the position keys on the canvas; drag a key dot to change the key", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).first().click();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("k");
  const pod = (await state(page)).scene.elements["pod-2"]!;
  await seek(page, 1000);
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("k");
  // The key is at the center of pod-2 at 1 s: 100 px up.
  const keyAt = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2 - 100);
  await page.mouse.move(keyAt.x, keyAt.y);
  await page.mouse.down();
  await page.mouse.move(keyAt.x + 30, keyAt.y + 10, { steps: 4 });
  await page.mouse.move(keyAt.x + 60, keyAt.y + 20, { steps: 4 });
  await page.mouse.up();
  const k = await keysOf(page, "pod-2");
  expect(k.x!.at(-1)!.v).toBeGreaterThan(pod.x + 20);
  expect(k.y!.at(-1)!.v).toBeGreaterThan(pod.y - 100);
  // One undo restores the key.
  await page.keyboard.press("Control+z");
  const back = await keysOf(page, "pod-2");
  expect(back.y!.at(-1)!.v).toBe(pod.y - 100);
});

test("select many keys with Shift: delete them together; copy keys and paste them on another element", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).first().click();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("k");
  const pod = (await state(page)).scene.elements["pod-2"]!;
  await seek(page, 800);
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("Shift+ArrowUp");
  await seek(page, 1600);
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("k");
  const keys = page.getByRole("slider", { name: /Keyframe Position of pod-2/ });
  // The step start (where the move starts) and the two moves.
  await expect(keys).toHaveCount(3);
  // Copy the two moves, paste on pod-1.
  await keys.nth(1).click();
  await keys.nth(2).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Control+c");
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["pod-1"]));
  await keys.nth(0).focus();
  await page.keyboard.press("Control+v");
  await expect(page.getByRole("slider", { name: /Keyframe Position of pod-1/ })).toHaveCount(2);
  // Delete the two keys of pod-2 at once.
  await keys.nth(1).click();
  await keys.nth(2).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Delete");
  await expect(keys).toHaveCount(1);
});

test("I inserts a position key at the playhead, Alt+I deletes it", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).first().click();
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("i");
  await expect(page.getByRole("slider", { name: /Keyframe Position of pod-2/ })).toHaveCount(1);
  expect((await state(page)).tool).toBe("select");
  await page.keyboard.press("Alt+i");
  await expect(page.getByRole("slider", { name: /Keyframe Position of pod-2/ })).toHaveCount(0);
});

test("F9 eases the selected key; the curve editor sets a custom curve", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).first().click();
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("i");
  const key = page.getByRole("slider", { name: /Keyframe Position of pod-2/ });
  await key.click();
  const easingNow = async () => (await keysOf(page, "pod-2")).x![0]!.ease ?? "ease-in-out";
  await page.keyboard.press("Shift+F9");
  expect(await easingNow()).toBe("ease-out");
  await page.keyboard.press("F9");
  expect(await easingNow()).toBe("ease-in-out");
  await page.getByRole("button", { name: "Edit the easing curve" }).click();
  await page.getByRole("button", { name: "Overshoot" }).click();
  expect(await easingNow()).toEqual({ cubicBezier: [0.34, 1.56, 0.64, 1] });
  // Drag the end handle: still a cubic bezier, one undo entry.
  const h = page.getByRole("slider", { name: "End handle" });
  const b = (await h.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 20, b.y + 30, { steps: 5 });
  await page.mouse.up();
  const e = (await easingNow()) as { cubicBezier: number[] };
  expect(e.cubicBezier[2]).toBeLessThan(0.64);
});

test("box select keys, then Alt + drag stretches their times", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).first().click();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("k");
  const pod = (await state(page)).scene.elements["pod-2"]!;
  await seek(page, 500);
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("Shift+ArrowUp");
  await seek(page, 1000);
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("k");
  const keys = page.getByRole("slider", { name: /Keyframe Position of pod-2/ });
  await expect(keys).toHaveCount(3);
  await keys.nth(2).scrollIntoViewIfNeeded();
  const a = (await keys.nth(1).boundingBox())!;
  const b = (await keys.nth(2).boundingBox())!;
  // Box select from left of the first key to right of the second.
  await page.mouse.move(a.x - 15, a.y - 6);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 15, b.y + b.height + 6, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText("2 keys")).toBeVisible();
  // Alt + drag the second key: twice as far from the first.
  const timesNow = async () => (await keysOf(page, "pod-2")).y!.map((k) => k.t).slice(-2);
  const before = await timesNow();
  // The tracks can scroll during the box drag: measure again.
  await keys.nth(2).scrollIntoViewIfNeeded();
  const a2 = (await keys.nth(1).boundingBox())!;
  const b2 = (await keys.nth(2).boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 + (b2.x - a2.x), b2.y + b2.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const after = await timesNow();
  expect(after[0]).toBe(before[0]);
  expect(after[1]! - after[0]!).toBeGreaterThan((before[1]! - before[0]!) * 1.6);
});
