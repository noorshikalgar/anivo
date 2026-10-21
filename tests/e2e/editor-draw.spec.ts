import { expect, test } from "@playwright/test";
import { drag, openEditor, screen, state } from "./helpers.js";

const newIds = async (page: Parameters<typeof state>[0], before: string[]) => Object.keys((await state(page)).scene.elements).filter((id) => !before.includes(id));

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("rectangle tool draws a rectangle and returns to select", async ({ page }) => {
  const before = Object.keys((await state(page)).scene.elements);
  await page.keyboard.press("r");
  await drag(page, await screen(page, 200, 800), await screen(page, 520, 960));
  const [id] = await newIds(page, before);
  const el = (await state(page)).scene.elements[id!]!;
  expect(el).toMatchObject({ type: "rectangle", x: 200, y: 800, width: 320, height: 160 });
  expect((await state(page)).tool).toBe("select");
});

test("arrow tool connects two elements with bindings", async ({ page }) => {
  await page.keyboard.press("a");
  await drag(page, await screen(page, 730, 540), await screen(page, 1310, 285));
  const s = await state(page);
  const c = s.scene.elements["c-lb-pod-1-2"] ?? s.scene.elements["c-lb-pod-1"];
  expect(c?.type).toBe("connector");
  expect(c?.start).toMatchObject({ kind: "bound", elementId: "lb" });
  expect(c?.end).toMatchObject({ kind: "bound", elementId: "pod-1" });
});

test("text tool adds text that the user types", async ({ page }) => {
  const before = Object.keys((await state(page)).scene.elements);
  await page.keyboard.press("t");
  const p = await screen(page, 900, 900);
  await page.mouse.click(p.x, p.y);
  await page.getByLabel("Element text").fill("Hello Anivo");
  await page.keyboard.press("Enter");
  const [id] = await newIds(page, before);
  expect((await state(page)).scene.elements[id!]).toMatchObject({ type: "text", content: { text: "Hello Anivo" } });
});

test("double-click edits a label", async ({ page }) => {
  const p = await screen(page, 1310, 540);
  await page.mouse.dblclick(p.x, p.y);
  await page.getByLabel("Element text").fill("api-2");
  await page.keyboard.press("Enter");
  expect((await state(page)).scene.elements["pod-2"]!.label?.text).toBe("api-2");
});

test("icon tool opens the picker and adds the chosen icon at the click", async ({ page }) => {
  const before = Object.keys((await state(page)).scene.elements);
  await page.keyboard.press("i");
  const p = await screen(page, 1000, 896);
  await page.mouse.click(p.x, p.y);
  await page.getByLabel("Search icons").fill("database");
  await page.getByRole("option", { name: "database", exact: true }).click();
  const [id] = await newIds(page, before);
  const el = (await state(page)).scene.elements[id!]!;
  expect(el).toMatchObject({ type: "icon", pack: "lucide", name: "database", x: 940, y: 836 });
});

test("an element drawn in a step enters in that step", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  const before = Object.keys((await state(page)).scene.elements);
  await page.keyboard.press("o");
  await drag(page, await screen(page, 200, 800), await screen(page, 360, 960));
  const [id] = await newIds(page, before);
  const step = (await state(page)).scene.steps.find((s) => s.id === "s-traffic")!;
  expect(step.actions.some((a) => a.type === "enter" && a.targets.includes(id!))).toBe(true);
});

test("code tool adds a code block that the panel can edit", async ({ page }) => {
  const before = Object.keys((await state(page)).scene.elements);
  await page.keyboard.press("c");
  const p = await screen(page, 200, 800);
  await page.mouse.click(p.x, p.y);
  const [id] = await newIds(page, before);
  expect((await state(page)).scene.elements[id!]).toMatchObject({ type: "code" });
  const code = page.getByLabel("Inspector").getByRole("textbox", { name: "Code" });
  await code.fill("print('hi')");
  await code.blur();
  await expect.poll(async () => ((await state(page)).scene.elements[id!] as unknown as { code: string }).code).toBe("print('hi')");
});

test("the arrow type changes in one click, and the next arrow uses it", async ({ page }) => {
  await page.keyboard.press("a");
  await drag(page, await screen(page, 730, 540), await screen(page, 1310, 285));
  const id = () => state(page).then((s) => Object.keys(s.scene.elements).find((k) => k.startsWith("c-lb-pod-1"))!);
  const first = await id();
  await page.getByRole("button", { name: "Arrows at both ends" }).click();
  let c = (await state(page)).scene.elements[first]!;
  expect([c.startHead, c.endHead]).toEqual(["arrow", "arrow"]);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  c = (await state(page)).scene.elements[first]!;
  expect([c.startHead, c.endHead]).toEqual(["none", "none"]);
  // The arrow tool remembers the type.
  const before = Object.keys((await state(page)).scene.elements);
  await page.keyboard.press("a");
  await drag(page, await screen(page, 730, 540), await screen(page, 1310, 795));
  const [next] = await newIds(page, before);
  c = (await state(page)).scene.elements[next!]!;
  expect([c.startHead, c.endHead]).toEqual(["none", "none"]);
});
