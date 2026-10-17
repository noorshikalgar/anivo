import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { ExportError, exportVideo, renderPng } from "./export.js";

const out = fileURLToPath(new URL("../../../tests/output/export/", import.meta.url));
mkdirSync(out, { recursive: true });
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

function load(input: unknown): Scene {
  const r = loadScene(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.scene;
}
const template = load(JSON.parse(readFileSync(new URL("../../../assets/templates/load-balancer.anivo.json", import.meta.url), "utf8")));

function probe(file: string): Record<string, string> {
  const text = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=codec_name,width,height,nb_read_frames,pix_fmt,r_frame_rate:stream_tags=alpha_mode", "-of", "default=nw=1", file]).toString();
  return Object.fromEntries(text.trim().split("\n").map((l) => l.replace(/^TAG:/, "").split("=") as [string, string]));
}

describe("renderPng", () => {
  it("renders a PNG with the bundled fonts", () => {
    const png = renderPng(template, 9000, { width: 640, height: 360 });
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });
});

describe.skipIf(!hasFfmpeg)("exportVideo", () => {
  it("exports MP4 (H.264) with the exact frame count", async () => {
    const file = `${out}lb.mp4`;
    let last = 0;
    const r = await exportVideo(template, { out: file, format: "mp4", width: 640, height: 360, fps: 30, range: { startMs: 0, endMs: 4000 }, quality: "draft", onProgress: (d) => (last = d) });
    expect(r.frames).toBe(120);
    expect(last).toBe(120);
    const p = probe(file);
    expect(p).toMatchObject({ codec_name: "h264", width: "640", height: "360", nb_read_frames: "120", pix_fmt: "yuv420p", r_frame_rate: "30/1" });
  }, 60_000);

  it("exports WebM (VP9) with an alpha channel", async () => {
    const scene = { ...template, settings: { ...template.settings, background: { kind: "transparent" as const } } };
    const file = `${out}lb-alpha.webm`;
    await exportVideo(scene, { out: file, format: "webm", width: 320, height: 180, fps: 24, range: { startMs: 7000, endMs: 8000 }, quality: "draft" });
    const p = probe(file);
    expect(p["codec_name"]).toBe("vp9");
    expect(p["alpha_mode"]).toBe("1");
  }, 60_000);

  it("exports a PNG sequence", async () => {
    const dir = `${out}seq`;
    await exportVideo(template, { out: dir, format: "png-seq", width: 160, height: 90, fps: 24, range: { startMs: 0, endMs: 500 } });
    expect(readdirSync(dir).filter((f) => f.endsWith(".png"))).toHaveLength(12);
  });

  it("stops when the signal is aborted", async () => {
    const ac = new AbortController();
    const p = exportVideo(template, { out: `${out}cancel.mp4`, format: "mp4", width: 320, height: 180, fps: 30, onProgress: (d) => d === 5 && ac.abort(), signal: ac.signal });
    await expect(p).rejects.toBeInstanceOf(ExportError);
  }, 60_000);
});

describe("exportVideo errors", () => {
  it("explains a missing FFmpeg", async () => {
    const p = exportVideo(template, { out: `${out}x.mp4`, format: "mp4", width: 64, height: 36, fps: 24, range: { startMs: 0, endMs: 100 }, ffmpegPath: "/no/such/ffmpeg" });
    await expect(p).rejects.toMatchObject({ code: "ffmpeg-missing" });
  });
});
