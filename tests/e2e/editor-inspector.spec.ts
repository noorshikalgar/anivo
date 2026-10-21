import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

async function selectLb(page: Parameters<typeof state>[0]) {
  const lb = (await state(page)).scene.elements["lb"]!;
  const p = await screen(page, lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByLabel("Inspector").getByText("Element", { exact: true })).toBeVisible();
}

test("fill swatch changes the element fill in the base state", async ({ page }) => {
  await selectLb(page);
  await page.getByRole("button", { name: /^Fill:/ }).click();
  await page.getByRole("radiogroup", { name: "Fill" }).getByRole("radio", { name: "danger", exact: true }).click();
  expect((await state(page)).scene.elements["lb"]!.style).toMatchObject({ fill: "danger" });
});

test("ID field renames the element", async ({ page }) => {
  await selectLb(page);
  const id = page.getByLabel("Inspector").getByRole("textbox").first();
  await id.fill("gateway");
  await id.press("Enter");
  const s = await state(page);
  expect(s.scene.elements["gateway"]).toBeDefined();
  expect(s.selection).toEqual(["gateway"]);
});

test("ID field shows an error for a duplicate ID", async ({ page }) => {
  await selectLb(page);
  const id = page.getByLabel("Inspector").getByRole("textbox").first();
  await id.fill("pod-1");
  await id.press("Enter");
  await expect(page.getByText("Element 'pod-1' exists already.")).toBeVisible();
  expect((await state(page)).scene.elements["lb"]).toBeDefined();
});

test("X field moves the element", async ({ page }) => {
  await selectLb(page);
  const x = page.getByRole("spinbutton").first();
  await x.fill("640");
  await x.press("Enter");
  expect((await state(page)).scene.elements["lb"]!.x).toBe(640);
});

test("a fill change in a step is static, and with Record on it becomes a keyframe", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await selectLb(page);
  await page.getByRole("button", { name: /^Fill:/ }).click();
  await page.getByRole("radiogroup", { name: "Fill" }).getByRole("radio", { name: "success", exact: true }).click();
  let s = await state(page);
  expect(s.scene.elements["lb"]!.style?.["fill"]).toBe("success");
  expect(s.scene.steps.find((st) => st.id === "s-traffic")!.actions.some((a) => a.type === "morph")).toBe(false);
  await page.keyboard.press("Escape");
  await selectLb(page);
  await page.keyboard.press("k");
  await page.getByRole("button", { name: /^Fill:/ }).click();
  await page.getByRole("radiogroup", { name: "Fill" }).getByRole("radio", { name: "danger", exact: true }).click();
  s = await state(page);
  expect(s.scene.elements["lb"]!.style?.["fill"]).toBe("success");
  const morph = s.scene.steps.find((st) => st.id === "s-traffic")!.actions.find((a) => a.type === "morph");
  expect(morph).toMatchObject({ targets: ["lb"], to: { fill: "danger" } });
});

test("scene panel changes the style", async ({ page }) => {
  await page.getByLabel("Inspector").getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Sketch/ }).click();
  expect((await state(page)).scene.settings.style).toBe("sketch");
});

test("a base edit warns when a step morph sets the property at the playhead", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await selectLb(page);
  await page.keyboard.press("k");
  await page.getByRole("button", { name: /^Fill:/ }).click();
  await page.getByRole("radiogroup", { name: "Fill" }).getByRole("radio", { name: "success", exact: true }).click();
  await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { selectStep(id: null): void; setPlayhead(ms: number): void; timeline: { totalMs: number } } } }).__anivo.getState();
    st.selectStep(null);
    st.setPlayhead(st.timeline.totalMs);
  });
  await expect(page.getByLabel("Inspector").getByText(/sets fill/)).toBeVisible();
  await page.getByRole("button", { name: /Go to step "Traffic flows/ }).click();
  expect((await state(page)).selectedStep).toBe("s-traffic");
});

test("drag a number field: the value changes, and one undo restores it", async ({ page }) => {
  await selectLb(page);
  const x0 = (await state(page)).scene.elements["lb"]!.x;
  const field = page.getByLabel("Inspector").getByRole("spinbutton", { name: "X", exact: true });
  const box = (await field.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 6, box.y + box.height / 2);
  await page.mouse.up();
  const x1 = (await state(page)).scene.elements["lb"]!.x;
  expect(x1).toBeGreaterThan(x0 + 20);
  await page.keyboard.press("Control+z");
  expect((await state(page)).scene.elements["lb"]!.x).toBe(x0);
  // Click without a drag: type a value, with arithmetic.
  await field.click();
  await page.keyboard.type("100+20");
  await page.keyboard.press("Enter");
  expect((await state(page)).scene.elements["lb"]!.x).toBe(120);
});

test("the outliner selects, hides, and locks elements", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Elements" });
  await tree.getByRole("button", { name: "pod-2", exact: true }).click();
  expect((await state(page)).selection).toEqual(["pod-2"]);
  await tree.getByRole("button", { name: "pod-3", exact: true }).click({ modifiers: ["Shift"] });
  expect((await state(page)).selection).toEqual(["pod-2", "pod-3"]);
  await tree.getByRole("button", { name: "Lock pod-2" }).click();
  await tree.getByRole("button", { name: "Hide pod-3 in the editor" }).click();
  const s = (await state(page)) as unknown as { scene: { elements: Record<string, { locked: boolean; editorHidden: boolean }> } };
  expect(s.scene.elements["pod-2"]!.locked).toBe(true);
  expect(s.scene.elements["pod-3"]!.editorHidden).toBe(true);
});
