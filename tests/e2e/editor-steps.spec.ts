import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

const stepIds = async (page: Parameters<typeof state>[0]) => (await state(page)).scene.steps.map((s) => s.id);

test("Add step adds a step after the selected step and selects it", async ({ page }) => {
  await page.getByRole("button", { name: /Load balancer/ }).first().click();
  await page.getByRole("button", { name: "Add step" }).click();
  const s = await state(page);
  expect(s.scene.steps).toHaveLength(5);
  expect(s.scene.steps[2]!.title).toBe("Step 5");
  expect(s.selectedStep).toBe(s.scene.steps[2]!.id);
  // A new step opens the Actions tab of the properties.
  await expect(page.getByRole("group", { name: "Quick actions" })).toBeVisible();
});

test("Add action adds an enter action for the selected element", async ({ page }) => {
  await page.getByRole("button", { name: "Add step" }).click();
  const pod = (await state(page)).scene.elements["pod-2"]!;
  const p = await screen(page, pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByRole("menuitem", { name: "Emphasis" }).click();
  await page.getByRole("menuitem", { name: "Pulse" }).click();
  const s = await state(page);
  const step = s.scene.steps.find((st) => st.id === s.selectedStep)!;
  expect(step.actions).toEqual([expect.objectContaining({ type: "emphasis", effect: "pulse", targets: ["pod-2"] })]);
});

test("the action editor changes the duration", async ({ page }) => {
  await page.getByRole("button", { name: /User appears/ }).click();
  await page.getByRole("option", { name: /Enter · draw-on/ }).click();
  const field = page.getByRole("spinbutton", { name: "Duration (ms)" });
  await field.fill("1200");
  await field.press("Enter");
  const step = (await state(page)).scene.steps[0]!;
  expect(step.actions[0]!.durationMs).toBe(1200);
});

test("the step menu duplicates and deletes a step", async ({ page }) => {
  await page.getByRole("button", { name: "More for step 2" }).click({ force: true });
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  expect(await stepIds(page)).toHaveLength(5);
  const s = await state(page);
  expect(s.scene.steps[2]!.title).toBe("Load balancer (copy)");
  expect(s.scene.steps[2]!.actions).toHaveLength(2);
  await page.getByRole("button", { name: "More for step 3" }).click({ force: true });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  expect(await stepIds(page)).toEqual(["s-user", "s-lb", "s-pods", "s-traffic"]);
});

test("N adds a step", async ({ page }) => {
  await page.keyboard.press("n");
  expect(await stepIds(page)).toHaveLength(5);
});

test("Add action adds a camera zoom to the selection", async ({ page }) => {
  await page.getByRole("button", { name: "Add step" }).click();
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["pod-1", "pod-2"]));
  await page.getByRole("button", { name: "Add action" }).first().click();
  await page.getByRole("menuitem", { name: "Camera: zoom to selection" }).click();
  const s = await state(page);
  const step = s.scene.steps.find((st) => st.id === s.selectedStep)!;
  expect(step.actions[0]).toMatchObject({ type: "camera", targets: ["pod-1", "pod-2"] });
});

test("the flow editor sets an icon particle, one particle, and a trail", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await page.getByRole("listbox", { name: "Actions" }).getByRole("option", { name: /^Flow/ }).first().click();
  await page.getByRole("combobox", { name: "Particle", exact: true }).click();
  await page.getByRole("option", { name: "Icon" }).click();
  await page.getByRole("combobox", { name: "Particles" }).click();
  await page.getByRole("option", { name: "One particle" }).click();
  const trail = page.getByRole("spinbutton", { name: "Trail (0–1)" });
  await trail.fill("0.5");
  await trail.press("Enter");
  await page.getByRole("checkbox", { name: "Turn along the arrow" }).click();
  const s = (await state(page)) as unknown as { scene: { steps: { id: string; actions: { type: string; flow?: Record<string, unknown> }[] }[] } };
  const flow = s.scene.steps.find((st) => st.id === "s-traffic")!.actions.find((a) => a.type === "flow")!.flow!;
  expect(flow).toMatchObject({ shape: "icon", icon: "lucide:mail", count: 1, trail: 0.5, orient: true, size: 32 });
  // Back to a stream: the count goes away.
  await page.getByRole("combobox", { name: "Particles" }).click();
  await page.getByRole("option", { name: "A stream" }).click();
  const s2 = (await state(page)) as unknown as typeof s;
  expect(s2.scene.steps.find((st) => st.id === "s-traffic")!.actions.find((a) => a.type === "flow")!.flow!["count"]).toBeUndefined();
});

test("Split per element gives each element its own action and keeps the timing", async ({ page }) => {
  await page.getByRole("button", { name: /Pods fan out/ }).click();
  await page.getByRole("option", { name: /Enter · pop/ }).click();
  await page.getByRole("button", { name: "More action commands" }).click();
  await page.getByRole("menuitem", { name: "Split per element" }).click();
  type S = { scene: { steps: { id: string; actions: { type: string; targets: string[]; delayMs: number; staggerMs: number; durationMs?: number }[] }[] } };
  const step = ((await state(page)) as unknown as S).scene.steps.find((s) => s.id === "s-pods")!;
  const pops = step.actions.filter((a) => a.type === "enter" && a.targets[0]!.startsWith("pod-"));
  expect(pops.map((a) => [a.targets, a.delayMs, a.staggerMs, a.durationMs])).toEqual([
    [["pod-1"], 400, 0, 450],
    [["pod-2"], 550, 0, 450],
    [["pod-3"], 700, 0, 450],
  ]);
  // A flow keeps its targets together: no split button.
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await page.getByRole("listbox", { name: "Actions" }).getByRole("option", { name: /^Flow/ }).nth(1).click();
  await page.getByRole("button", { name: "More action commands" }).click();
  await expect(page.getByRole("menuitem", { name: "Split per element" })).toBeDisabled();
});

test("a quick action with no selection asks for the elements, and After previous chains the timing", async ({ page }) => {
  await page.getByRole("button", { name: /Pods fan out/ }).click();
  await page.getByRole("group", { name: "Quick actions" }).getByRole("button", { name: "Pulse" }).click();
  const dialog = page.getByRole("dialog", { name: "Pulse: choose the elements" });
  await dialog.getByRole("checkbox").first().waitFor();
  await dialog.getByText("lb", { exact: true }).click();
  await dialog.getByRole("button", { name: "Use 1 element" }).click();
  type S = { scene: { steps: { id: string; actions: { type: string; effect?: string; targets: string[]; delayMs: number }[] }[] }; activeAction: string };
  let s = (await state(page)) as unknown as S;
  const step = s.scene.steps.find((x) => x.id === "s-pods")!;
  const pulse = step.actions.at(-1)!;
  expect(pulse).toMatchObject({ type: "emphasis", effect: "pulse", targets: ["lb"] });
  expect(s.activeAction).toBe((pulse as unknown as { id: string }).id);
  await page.getByRole("button", { name: "After previous" }).click();
  s = (await state(page)) as unknown as S;
  const chained = s.scene.steps.find((x) => x.id === "s-pods")!.actions.at(-1) as unknown as { after?: string; delayMs: number };
  const prevId = (s.scene.steps.find((x) => x.id === "s-pods")!.actions.at(-2) as unknown as { id: string }).id;
  expect(chained).toMatchObject({ after: prevId, delayMs: 0 });
  // The chain starts the pulse after the action before it ends.
  await expect(page.getByRole("button", { name: "Unchain" })).toBeVisible();
});

test("a two-way flow gets own settings for the way back", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await page.getByRole("listbox", { name: "Actions" }).getByRole("option", { name: /^Flow/ }).first().click();
  await page.getByRole("combobox", { name: "Direction" }).click();
  await page.getByRole("option", { name: "Both" }).click();
  await page.getByRole("checkbox", { name: "Own settings for the way back" }).click();
  type S = { scene: { steps: { id: string; actions: { type: string; flow?: { direction: string; back?: Record<string, unknown> } }[] }[] } };
  const flow = ((await state(page)) as unknown as S).scene.steps.find((x) => x.id === "s-traffic")!.actions.find((a) => a.type === "flow")!.flow!;
  expect(flow.direction).toBe("both");
  expect(flow.back).toBeDefined();
});

test("with a step selected, a change shows at once: the playhead follows the end of the step", async ({ page }) => {
  await page.getByRole("button", { name: /Pods fan out/ }).click();
  type S = { playhead: number; timeline: { steps: { id: string; endMs: number }[] } };
  const before = (await state(page)) as unknown as S;
  const end0 = before.timeline.steps.find((x) => x.id === "s-pods")!.endMs;
  expect(before.playhead).toBe(end0);
  // A longer action makes the step longer; the playhead moves to the new end.
  await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { apply(tx: unknown): unknown } } }).__anivo.getState();
    st.apply({ ops: [{ op: "action.add", step: "s-pods", action: { type: "emphasis", effect: "pulse", targets: ["lb"], delayMs: 2000, durationMs: 1000 } }] });
  });
  const after = (await state(page)) as unknown as S;
  const end1 = after.timeline.steps.find((x) => x.id === "s-pods")!.endMs;
  expect(end1).toBeGreaterThan(end0);
  expect(after.playhead).toBe(end1);
});

test("Insert, Bullet list build makes the title and point steps", async ({ page }) => {
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("menuitem", { name: "Bullet list build…" }).click();
  const dialog = page.getByRole("dialog", { name: "Bullet list build" });
  await dialog.getByRole("textbox", { name: "Build points, one for each line" }).fill("One\nTwo");
  await dialog.getByRole("button", { name: "Make the steps" }).click();
  const titles = ((await state(page)) as unknown as { scene: { steps: { title: string }[] } }).scene.steps.map((s) => s.title);
  expect(titles.slice(-6)).toEqual(["Start", "Title", "Point 1", "Point 1 up", "Point 2", "Point 2 up"]);
});

test("Send moves an element along an arrow, and it follows the arrow when the arrow moves", async ({ page }) => {
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("group", { name: "Quick actions" }).getByRole("button", { name: "Send" }).click();
  let dialog = page.getByRole("dialog", { name: "Send: choose the elements that move" });
  await dialog.getByText("user", { exact: true }).click();
  await dialog.getByRole("button", { name: "Use 1 element" }).click();
  dialog = page.getByRole("dialog", { name: "Send: choose the arrow" });
  await dialog.getByText("c-lb-2", { exact: true }).click();
  await dialog.getByRole("button", { name: "Use 1 element" }).click();
  type M = { type: string; durationMs: number; motion: { along: string; points: { x: number; y: number }[] } };
  const last = async () => {
    const s = await state(page);
    return s.scene.steps.find((x) => x.id === s.selectedStep)!.actions.at(-1) as unknown as M;
  };
  const send = await last();
  expect(send).toMatchObject({ type: "motion", durationMs: 2400, motion: { along: "c-lb-2" } });
  // Move pod-2 in the base: the path follows the arrow.
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { apply(t: unknown): unknown } } }).__anivo.getState().apply({ label: "Move", ops: [{ op: "element.update", id: "pod-2", set: { y: 900 } }] }));
  const after = await last();
  expect(after.motion.points.at(-1)!.y).toBeGreaterThan(send.motion.points.at(-1)!.y + 100);
});

test("a step caption: type it in the Actions tab, and the step holds for reading", async ({ page }) => {
  await page.getByRole("button", { name: /Load balancer/ }).first().click();
  const before = (await state(page)) as unknown as { timeline: { steps: { id: string; holdEndMs: number; startMs: number }[] }; selectedStep: string };
  const ts0 = before.timeline.steps.find((x) => x.id === before.selectedStep)!;
  const field = page.getByRole("textbox", { name: "Caption" });
  await field.fill("The load balancer sends each request to one pod, so no pod gets too much work");
  await field.press("Tab");
  const s = (await state(page)) as unknown as typeof before & { scene: { steps: { id: string; caption?: { text: string; side: string } }[] } };
  expect(s.scene.steps.find((x) => x.id === s.selectedStep)!.caption).toMatchObject({ side: "auto" });
  const ts = s.timeline.steps.find((x) => x.id === s.selectedStep)!;
  expect(ts.holdEndMs - ts.startMs).toBeGreaterThan(ts0.holdEndMs - ts0.startMs);
  expect(ts.holdEndMs - ts.startMs).toBeGreaterThan(6000);
});

test("Insert, Message types a message and sends it along the arrows", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["user", "pod-2"]));
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("menuitem", { name: /Message/ }).click();
  const dialog = page.getByRole("dialog", { name: "Message build" });
  await expect(dialog.getByText("user → lb → pod-2")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Message text" }).fill("GET /home");
  await dialog.getByRole("button", { name: "Make the steps" }).click();
  const s = (await state(page)) as unknown as { scene: { steps: { title: string; caption?: { text: string }; actions: { type: string; motion?: { along?: string } }[] }[] } };
  const [typing, send] = s.scene.steps.slice(-2);
  expect(typing!.actions[0]).toMatchObject({ type: "enter" });
  expect(send!.actions.map((a) => a.motion?.along)).toEqual(["c-user-lb", "c-lb-2"]);
  expect(send!.caption?.text).toContain("pod-2");
});

test("One by one: the selected elements come in one after the other, top to bottom", async ({ page }) => {
  await page.getByRole("button", { name: "Add step" }).click();
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["pod-3", "pod-1", "pod-2"]));
  // A selection shows the Element tab: go back to the Actions tab.
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ propTab: "actions" }));
  await page.getByRole("group", { name: "Quick actions" }).getByRole("button", { name: "One by one" }).click();
  const s = await state(page);
  const a = s.scene.steps.find((x) => x.id === s.selectedStep)!.actions.at(-1) as unknown as { type: string; staggerMs: number; targets: string[] };
  expect(a).toMatchObject({ type: "enter", staggerMs: 350, targets: ["pod-1", "pod-2", "pod-3"] });
});

test("Design and Animate modes", async ({ page }) => {
  await page.getByRole("button", { name: /Traffic flows/ }).click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  let s = (await state(page)) as unknown as { selectedStep: string | null; timelineOpen: boolean };
  expect(s.selectedStep).toBeNull();
  expect(s.timelineOpen).toBe(false);
  await page.getByRole("button", { name: "Animate", exact: true }).click();
  s = (await state(page)) as unknown as typeof s;
  expect(s.timelineOpen).toBe(true);
  expect(s.selectedStep).not.toBeNull();
});

test("Mark words: choose words by clicking them, and the mark keeps the phrase", async ({ page }) => {
  await page.getByRole("button", { name: "Add step" }).click();
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["lb"]));
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ propTab: "actions" }));
  await page.getByRole("group", { name: "Quick actions" }).getByRole("button", { name: "Mark words" }).click();
  type M = { type: string; mark: { phrase: string; color?: string } };
  const last = async () => {
    const s = await state(page);
    return s.scene.steps.find((x) => x.id === s.selectedStep)!.actions.at(-1) as unknown as M;
  };
  expect(await last()).toMatchObject({ type: "mark", mark: { phrase: "Load", color: "accent" } });
  const words = page.getByRole("group", { name: "Words of the text" });
  await words.getByRole("button", { name: "balancer" }).click({ modifiers: ["Shift"] });
  expect((await last()).mark.phrase).toBe("Load balancer");
  await words.getByRole("button", { name: "balancer" }).click();
  expect((await last()).mark.phrase).toBe("balancer");
});

test("Presets: one click gives each selected element the animation; save your own", async ({ page }) => {
  await page.getByRole("button", { name: "Add step" }).click();
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["pod-1", "pod-2"]));
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ propTab: "actions" }));
  await page.getByRole("button", { name: "Preset: Rise in" }).click();
  type A = { type: string; effect?: string; targets: string[]; delayMs: number };
  const acts = async () => {
    const s = await state(page);
    return s.scene.steps.find((x) => x.id === s.selectedStep)!.actions as unknown as A[];
  };
  expect((await acts()).map((a) => [a.effect, a.targets, a.delayMs])).toEqual([
    ["rise", ["pod-1"], 0],
    ["rise", ["pod-2"], 120],
  ]);
  await page.getByRole("button", { name: /Save the actions of the selection as a preset/ }).click();
  await page.getByRole("textbox", { name: "Preset name" }).fill("My rise");
  await page.getByRole("dialog", { name: "Save as preset" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Preset: My rise" })).toBeVisible();
  // Export the presets as a file, then import the file again: the preset with the same name is replaced, not doubled.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export my presets" }).click()]);
  const file = await download.path();
  await page.getByLabel("Preset file").setInputFiles(file);
  await expect(page.getByText("Added 1 preset.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Preset: My rise" })).toHaveCount(1);
});

test("Compositions: save elements with their animations, and insert them again as new steps", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["lb"]));
  await page.evaluate(() => (window as unknown as { __anivo: { setState(p: unknown): void } }).__anivo.setState({ compositionsOpen: true }));
  const dialog = page.getByRole("dialog", { name: "Compositions" });
  await dialog.getByRole("textbox", { name: "Composition name" }).fill("LB intro");
  await dialog.getByRole("button", { name: "Save the selection" }).click();
  const card = dialog.getByRole("listitem", { name: "LB intro" });
  await expect(card).toBeVisible();
  const before = (await state(page)).scene.steps.length;
  // Set its text before inserting it (a slot).
  await card.getByRole("button", { name: "Set texts…" }).click();
  await card.getByRole("group").getByRole("textbox").first().fill("Gateway");
  await card.getByRole("button", { name: "Insert" }).click();
  const s = await state(page);
  expect(s.scene.elements["lb-2"]).toBeTruthy();
  expect((s.scene.elements["lb-2"] as unknown as { label: { text: string } }).label.text).toBe("Gateway");
  expect(s.scene.steps.length).toBeGreaterThan(before);
  expect(s.selection).toEqual(["lb-2"]);
});

test("Styles: copy the style of an element, paste it, apply a ready-made style, save your own", async ({ page }) => {
  const sel = (ids: string[]) => page.evaluate((x) => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(x), ids);
  const style = async (id: string) => ((await state(page)).scene.elements[id] as unknown as { style: Record<string, unknown> }).style;
  await sel(["lb"]);
  await page.getByRole("button", { name: "Styles", exact: true }).click();
  await page.getByRole("button", { name: "Style: Accent" }).click();
  expect(await style("lb")).toMatchObject({ fill: "accent", cornerRadius: 12 });
  await page.keyboard.press("Control+Alt+KeyC");
  await sel(["pod-1"]);
  await page.keyboard.press("Control+Alt+KeyV");
  expect(await style("pod-1")).toMatchObject({ fill: "accent", fontWeight: 700 });
  await page.getByRole("button", { name: "Save this style…" }).click();
  await page.getByRole("textbox", { name: "Style name" }).fill("Brand");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Style: Brand" })).toBeVisible();
});

test("the Steps list shows a small frame of each step; the button hides them (docs/22 D4)", async ({ page }) => {
  const steps = page.getByRole("navigation", { name: "Steps" });
  const n = (await state(page)).scene.steps.length;
  await expect(steps.locator("[data-step-thumb]")).toHaveCount(n);
  await steps.getByRole("button", { name: "Hide step frames" }).click();
  await expect(steps.locator("[data-step-thumb]")).toHaveCount(0);
});
