import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

/** Click the ruler at a time from the start of the selected step (the ruler goes 3 s past the end). */
const seek = async (page: import("@playwright/test").Page, stepRel: number) => {
  const ruler = page.getByLabel("Time ruler");
  const box = (await ruler.boundingBox())!;
  const { at, span } = await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { timeline: { totalMs: number; steps: { id: string; startMs: number }[] }; selectedStep: string } } }).__anivo.getState();
    const s = st.timeline.steps.find((x) => x.id === st.selectedStep)!;
    return { at: s.startMs, span: Math.max(1000, st.timeline.totalMs + 3000) };
  });
  // The lower half of the ruler: the upper half has the step sections.
  await page.mouse.click(box.x + ((at + stepRel) / span) * box.width, box.y + box.height * 0.75);
};

type Morph = { delayMs: number; durationMs?: number };

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

  const s = await state(page);
  const step = s.scene.steps.find((x) => x.id === s.selectedStep)!;
  const morphs = step.actions.filter((a) => a.type === "morph") as unknown as Morph[];
  expect(morphs).toHaveLength(2);
  expect(morphs.map((m) => [m.delayMs, m.durationMs])).toEqual([
    [0, 1000],
    [1000, expect.any(Number)],
  ]);

  const keys = page.getByRole("slider", { name: /Keyframe Position of pod-2/ });
  await expect(keys).toHaveCount(2);
  // Arrow keys move a keyframe; Delete removes it.
  await keys.first().focus();
  await page.keyboard.press("ArrowRight");
  const after = (await state(page)).scene.steps.find((x) => x.id === s.selectedStep)!.actions.filter((a) => a.type === "morph") as unknown as Morph[];
  expect(after.map((m) => m.delayMs)).toEqual([0, 1100]);
  await keys.first().focus();
  await page.keyboard.press("Delete");
  await expect(keys).toHaveCount(1);
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
  const morphs = s.scene.steps.find((x) => x.id === s.selectedStep)!.actions.filter((a) => a.type === "morph");
  expect(morphs).toHaveLength(2);
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
  const s = await state(page);
  const morph = s.scene.steps.find((x) => x.id === s.selectedStep)!.actions.find((a) => a.type === "morph") as unknown as { to: { x: number; y: number } };
  expect(morph.to.x).toBeGreaterThan(pod.x + 20);
  expect(morph.to.y).toBeGreaterThan(pod.y - 100);
  // One undo restores the key.
  await page.keyboard.press("Control+z");
  const u = await state(page);
  const back = u.scene.steps.find((x) => x.id === u.selectedStep)!.actions.find((a) => a.type === "morph") as unknown as { to: { x?: number; y: number } };
  expect(back.to).toEqual({ y: pod.y - 100 });
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
  await expect(keys).toHaveCount(2);
  // Copy both, paste on pod-1.
  await keys.nth(0).click();
  await keys.nth(1).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Control+c");
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["pod-1"]));
  await keys.nth(0).focus();
  await page.keyboard.press("Control+v");
  await expect(page.getByRole("slider", { name: /Keyframe Position of pod-1/ })).toHaveCount(2);
  // Delete both keys of pod-2 at once.
  await keys.nth(0).click();
  await keys.nth(1).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Delete");
  await expect(keys).toHaveCount(0);
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
