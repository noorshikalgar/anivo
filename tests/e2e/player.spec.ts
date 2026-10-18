import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openEditor } from "./helpers.js";

const FIXTURE = readFileSync(new URL("../../packages/schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8");
const ORIGIN = "http://localhost:5173";

type P = HTMLElement & { duration: number; currentTime: number; paused: boolean; play(): Promise<void>; pause(): void; goToStep(n: number): void };

/** Sum of the pixel values of the player canvas: 0 means nothing is drawn yet. */
const ink = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const c = document.querySelector("anivo-player")!.shadowRoot!.querySelector("canvas")!;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) n += d[i]! + d[i + 1]! + d[i + 2]!;
    return n;
  });

test("<anivo-player> loads a scene from src, plays, and moves by step", async ({ page }) => {
  await page.route(`${ORIGIN}/test/scene.json`, (r) => r.fulfill({ body: FIXTURE, contentType: "application/json" }));
  await page.goto(`${ORIGIN}/test-blank`);
  await page.setContent(`<anivo-player src="${ORIGIN}/test/scene.json" controls style="width:640px"></anivo-player><script type="module" src="${ORIGIN}/player/anivo-player.js"></script>`);
  const player = page.locator("anivo-player");
  await player.evaluate((el) => new Promise((res) => (el as P).duration > 0 ? res(0) : el.addEventListener("ready", res, { once: true })));
  expect(await player.evaluate((el) => (el as P).duration)).toBeGreaterThan(4000);
  expect(await player.evaluate((el) => (el as P).currentTime)).toBe(-1);
  const base = await ink(page);
  await player.getByRole("button", { name: "Next step" }).click();
  await player.getByRole("button", { name: "Next step" }).click();
  expect(await player.evaluate((el) => (el as P).currentTime)).toBeGreaterThan(1000);
  expect(await ink(page)).not.toBe(base);
  await player.getByRole("button", { name: "Play" }).click();
  await expect(player.getByRole("button", { name: "Pause" })).toBeVisible();
  const t = await player.evaluate((el) => (el as P).currentTime);
  await page.waitForTimeout(400);
  expect(await player.evaluate((el) => (el as P).currentTime)).toBeGreaterThan(t + 200);
});

test("the HTML export plays with no network", async ({ page, context }) => {
  await openEditor(page);
  await page.keyboard.press("Control+e");
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  await page.getByRole("radio", { name: "HTML player" }).check();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Export", exact: true }).click();
  const file = await (await download).path();
  const html = readFileSync(file, "utf8");
  expect(html).toContain("<anivo-player controls>");
  const offline = await context.newPage();
  const requests: string[] = [];
  await offline.route("**/*", (r) => (requests.push(r.request().url()), r.abort()));
  await offline.setContent(html);
  const player = offline.locator("anivo-player");
  await expect.poll(() => player.evaluate((el) => (el as P).duration)).toBeGreaterThan(4000);
  await player.evaluate((el) => (el as P).goToStep(4));
  expect(await ink(offline)).toBeGreaterThan(0);
  expect(requests).toEqual([]);
});
