import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderPng } from "@anivo/export-node";
import { type Scene, loadScene } from "@anivo/schema";
import { expect, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

type Api = {
  ready(): Promise<boolean>;
  renderPng(t: number, w: number, h: number, style?: "clean" | "sketch"): Promise<string>;
  supportedFormats(): Promise<string[]>;
  exportVideo(format: string, w: number, h: number, fps: number, startMs: number, endMs: number): Promise<{ frames: number; mimeType: string; base64: string }>;
};
declare global {
  interface Window {
    anivo: Api;
  }
}

const out = fileURLToPath(new URL("../output/e2e/", import.meta.url));
mkdirSync(out, { recursive: true });

function load(): Scene {
  const r = loadScene(JSON.parse(readFileSync(new URL("../../assets/templates/load-balancer.anivo.json", import.meta.url), "utf8")));
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.scene;
}

const W = 960;
const H = 540;
/** Phase 0 exit gate: browser and Node frames differ by less than 0.5% of pixels. */
const MAX_DIFF_RATIO = 0.005;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.anivo !== undefined);
  await page.evaluate(() => window.anivo.ready());
});

for (const style of ["clean", "sketch"] as const) {
  test(`browser and Node frames match (${style})`, async ({ page }) => {
    const scene = load();
    for (const t of [800, 2400, 3300, 6000, 9000]) {
      const b64 = await page.evaluate(([tt, s]) => window.anivo.renderPng(tt as number, 960, 540, s as "clean" | "sketch"), [t, style] as const);
      const browser = PNG.sync.read(Buffer.from(b64, "base64"));
      const node = PNG.sync.read(renderPng(scene, t, { width: W, height: H, style }));
      const diff = new PNG({ width: W, height: H });
      const n = pixelmatch(browser.data, node.data, diff.data, W, H, { threshold: 0.1 });
      writeFileSync(`${out}${style}-${t}-browser.png`, PNG.sync.write(browser));
      writeFileSync(`${out}${style}-${t}-node.png`, PNG.sync.write(node));
      writeFileSync(`${out}${style}-${t}-diff.png`, PNG.sync.write(diff));
      const ratio = n / (W * H);
      console.log(`${style} t=${t}: ${(ratio * 100).toFixed(3)}% pixels differ`);
      expect(ratio).toBeLessThan(MAX_DIFF_RATIO);
    }
  });
}

test("exports MP4 in the browser with WebCodecs", async ({ page }) => {
  const formats = await page.evaluate(() => window.anivo.supportedFormats());
  console.log(`Browser formats: ${formats.join(", ")}`);
  test.skip(!formats.includes("mp4"), "This browser build cannot encode H.264.");
  const r = await page.evaluate(() => window.anivo.exportVideo("mp4", 640, 360, 30, 0, 4000));
  expect(r.frames).toBe(120);
  const file = `${out}browser.mp4`;
  writeFileSync(file, Buffer.from(r.base64, "base64"));
  if (spawnSync("ffprobe", ["-version"]).status === 0) {
    const info = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=codec_name,nb_read_frames,width,height", "-of", "csv=p=0", file]).toString().trim();
    expect(info).toBe("h264,640,360,120");
  }
});

test("exports WebM in the browser with WebCodecs", async ({ page }) => {
  const formats = await page.evaluate(() => window.anivo.supportedFormats());
  test.skip(!formats.includes("webm"), "This browser build cannot encode VP9.");
  const r = await page.evaluate(() => window.anivo.exportVideo("webm", 640, 360, 30, 0, 2000));
  expect(r.frames).toBe(60);
  writeFileSync(`${out}browser.webm`, Buffer.from(r.base64, "base64"));
});
