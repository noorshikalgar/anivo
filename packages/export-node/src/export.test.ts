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
const template = load(JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")));

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

  it("mixes the voiceover into the MP4 at its start time", async () => {
    const wav = `${out}tone.wav`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", wav]);
    const bytes = new Uint8Array(readFileSync(wav));
    const id = "00000000000000aa";
    const scene = { ...template, assets: { [id]: { id, mime: "audio/wav", bytes: bytes.length } }, audio: [{ id: "voiceover", kind: "voiceover" as const, assetId: id, durationMs: 2000, startMs: 500, gainDb: 0, trimStartMs: 0 }] };
    const file = `${out}lb-audio.mp4`;
    await exportVideo(scene, { out: file, format: "mp4", width: 320, height: 180, fps: 24, range: { startMs: 0, endMs: 3000 }, quality: "draft", assets: new Map([[id, bytes]]) });
    const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "default=nw=1", file]).toString();
    expect(info).toContain("codec_name=aac");
    expect(info).toContain("codec_type=audio");
    expect(Number(/duration=([\d.]+)/.exec(info)?.[1])).toBeCloseTo(3, 0);
    // Silence before 0.5 s, the tone after it.
    const level = (from: number) => {
      const r = spawnSync("ffmpeg", ["-v", "info", "-ss", String(from), "-t", "0.3", "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? "-100");
    };
    expect(level(0.05)).toBeLessThan(-60);
    expect(level(1.2)).toBeGreaterThan(-30);
  }, 60_000);

  it("ducks the music while the voiceover speaks", async () => {
    // Voice: 1 kHz from 1 s to 2 s. Music: 220 Hz for 4 s, ducked by 20 dB.
    const voice = `${out}voice.wav`;
    const music = `${out}music.wav`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:duration=1", "-af", "adelay=1000,apad=whole_dur=3", voice]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=4", music]);
    const vb = new Uint8Array(readFileSync(voice));
    const mb = new Uint8Array(readFileSync(music));
    const vid = "00000000000000b1";
    const mid = "00000000000000b2";
    const scene = {
      ...template,
      assets: { [vid]: { id: vid, mime: "audio/wav", bytes: vb.length }, [mid]: { id: mid, mime: "audio/wav", bytes: mb.length } },
      audio: [
        { id: "voiceover", kind: "voiceover" as const, assetId: vid, durationMs: 3000, startMs: 0, gainDb: 0, trimStartMs: 0 },
        { id: "music", kind: "music" as const, assetId: mid, durationMs: 4000, startMs: 0, gainDb: 0, trimStartMs: 0, duckDb: -20 },
      ],
    };
    const file = `${out}ducked.mp4`;
    await exportVideo(scene, { out: file, format: "mp4", width: 320, height: 180, fps: 24, range: { startMs: 0, endMs: 3500 }, quality: "draft", assets: new Map([[vid, vb], [mid, mb]]) });
    const music220 = (from: number) => {
      const r = spawnSync("ffmpeg", ["-v", "info", "-ss", String(from), "-t", "0.3", "-i", file, "-vn", "-af", "bandpass=f=220:width_type=h:w=60,volumedetect", "-f", "null", "-"], { encoding: "utf8" });
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? "-100");
    };
    const before = music220(0.3);
    const during = music220(1.4);
    const after = music220(3.0);
    expect(before - during).toBeGreaterThan(14);
    expect(Math.abs(before - after)).toBeLessThan(3);
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
