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

test("a fill change in a step becomes a morph", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await selectLb(page);
  await page.getByRole("radiogroup", { name: "Fill" }).getByRole("radio", { name: "success", exact: true }).click();
  const s = await state(page);
  expect(s.scene.elements["lb"]!.style?.["fill"]).toBe("accent-soft");
  const morph = s.scene.steps.find((st) => st.id === "s-traffic")!.actions.find((a) => a.type === "morph");
  expect(morph).toMatchObject({ targets: ["lb"], to: { fill: "success" } });
});

test("scene panel changes the style", async ({ page }) => {
  await page.getByLabel("Inspector").getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Sketch/ }).click();
  expect((await state(page)).scene.settings.style).toBe("sketch");
});

test("a base edit warns when a step morph sets the property at the playhead", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await selectLb(page);
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
