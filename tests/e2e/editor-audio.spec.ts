import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

/** A mono 16-bit WAV file: a 440 Hz tone. */
function wav(seconds: number, rate = 8000): string {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  return b.toString("base64");
}

const addAudio = (page: import("@playwright/test").Page, seconds: number, kind: string) =>
  page.evaluate(([b64, k]) => (window as unknown as { __anivoAddAudio(b: string, n: string, k: string): Promise<string> }).__anivoAddAudio(b64!, "voice.wav", k!), [wav(seconds), kind]);

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("a voiceover shows in the audio lane and extends the timeline", async ({ page }) => {
  const before = (await state(page)) as unknown as { timeline: { totalMs: number } };
  await addAudio(page, before.timeline.totalMs / 1000 + 3, "voiceover");
  const s = (await state(page)) as unknown as { scene: { audio: { id: string; kind: string; durationMs: number }[] }; timeline: { totalMs: number } };
  expect(s.scene.audio).toEqual([expect.objectContaining({ id: "voiceover", kind: "voiceover" })]);
  expect(s.timeline.totalMs).toBeGreaterThan(before.timeline.totalMs + 2500);
  await expect(page.getByLabel("Audio tracks").getByText("voice.wav")).toBeVisible();
});

test("dragging the clip moves the start time, and undo moves it back", async ({ page }) => {
  await addAudio(page, 2, "music");
  const clip = page.getByRole("slider", { name: "music start time" });
  const box = (await clip.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const moved = ((await state(page)) as unknown as { scene: { audio: { startMs: number }[] } }).scene.audio[0]!.startMs;
  expect(moved).toBeGreaterThan(0);
  await page.keyboard.press("Control+z");
  expect(((await state(page)) as unknown as { scene: { audio: { startMs: number }[] } }).scene.audio[0]!.startMs).toBe(0);
});

test("a new voiceover replaces the old one", async ({ page }) => {
  await addAudio(page, 1, "voiceover");
  await addAudio(page, 2, "voiceover");
  const s = (await state(page)) as unknown as { scene: { audio: { durationMs: number }[] } };
  expect(s.scene.audio).toHaveLength(1);
  expect(s.scene.audio[0]!.durationMs).toBe(2000);
});

test("remove deletes the track", async ({ page }) => {
  await addAudio(page, 1, "sfx");
  await page.getByLabel("Audio tracks").getByRole("button", { name: "Remove audio" }).click();
  await expect(page.getByLabel("Audio tracks")).toHaveCount(0);
});

type S = { scene: { steps: { id: string; trigger: { kind: string; atMs?: number } }[]; script: { text: string; stepId?: string }[] }; timeline: { steps: { startMs: number }[] }; playhead: number };
const st = async (page: import("@playwright/test").Page) => (await state(page)) as unknown as S;

test("the script dialog sets one line for each step", async ({ page }) => {
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit script…" }).click();
  await page.getByLabel("Voiceover script").fill("A user sends a request.\n\nThe load balancer gets it.\nPods start.\nTraffic flows.\nExtra line.");
  await expect(page.getByText("5 lines, 4 steps. 1 lines have no step.")).toBeVisible();
  await page.getByRole("button", { name: "Set script" }).click();
  const s = await st(page);
  expect(s.scene.script.map((l) => l.text)).toEqual(["A user sends a request.", "The load balancer gets it.", "Pods start.", "Traffic flows.", "Extra line."]);
  expect(s.scene.script[1]!.stepId).toBe(s.scene.steps[1]!.id);
  expect(s.scene.script[4]!.stepId).toBeUndefined();
});

test("the step inspector edits the script line of the step", async ({ page }) => {
  await page.getByRole("button", { name: /Load balancer/ }).first().click();
  const field = page.getByLabel("Inspector").getByRole("textbox", { name: "Script line" });
  await field.fill("Here is the load balancer.");
  await field.blur();
  const s = await st(page);
  expect(s.scene.script).toEqual([expect.objectContaining({ text: "Here is the load balancer.", stepId: s.scene.steps[1]!.id })]);
});

test("cue markers show on the voiceover and drag to move the step start", async ({ page }) => {
  await addAudio(page, 12, "voiceover");
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByRole("menuitem", { name: "Start all steps at voiceover cues" }).click();
  let s = await st(page);
  expect(s.scene.steps.every((x) => x.trigger.kind === "cue")).toBe(true);
  const cue = page.getByRole("slider", { name: "Cue of step 4" });
  const before = s.scene.steps[3]!.trigger.atMs!;
  const box = (await cue.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  s = await st(page);
  expect(s.scene.steps[3]!.trigger.atMs!).toBeGreaterThan(before + 300);
  expect(s.timeline.steps[3]!.startMs).toBe(s.scene.steps[3]!.trigger.atMs);
});

test("M during play puts a cue for the next step at the playhead", async ({ page }) => {
  await addAudio(page, 12, "voiceover");
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { play(): void } } }).__anivo.getState().play());
  await page.waitForTimeout(300);
  await page.keyboard.press("m");
  const s = await st(page);
  const cued = s.scene.steps.filter((x) => x.trigger.kind === "cue");
  expect(cued).toHaveLength(1);
  expect(cued[0]!.id).toBe(s.scene.steps[1]!.id);
  expect(cued[0]!.trigger.atMs!).toBeGreaterThan(100);
});
