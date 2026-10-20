import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

/** Click the Keys ruler at a time of the selected step (the Keys view can go past the step end). */
const seek = async (page: import("@playwright/test").Page, stepRel: number) => {
  const ruler = page.getByLabel("Time ruler");
  const box = (await ruler.boundingBox())!;
  const { span } = await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { timeline: { steps: { id: string; startMs: number; holdEndMs: number }[] }; selectedStep: string } } }).__anivo.getState();
    const s = st.timeline.steps.find((x) => x.id === st.selectedStep)!;
    return { span: Math.max(1000, s.holdEndMs - s.startMs) * 1.25 };
  });
  await page.mouse.click(box.x + (stepRel / span) * box.width, box.y + box.height / 2);
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
  await page.getByRole("tab", { name: "Keys" }).click();
  expect((await state(page) as unknown as { autoKey: boolean }).autoKey).toBe(true);
  await expect(page.getByRole("button", { name: "Auto-key" })).toHaveAttribute("aria-pressed", "true");

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
