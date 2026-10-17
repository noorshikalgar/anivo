import { spawn } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveTimeline } from "@anivo/engine";
import { type Ctx2D, type RenderOptions, renderScene } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import { createCanvas } from "@napi-rs/canvas";
import { registerBundledAssets } from "./fonts.js";

export type NodeExportFormat = "mp4" | "webm" | "gif" | "prores" | "png-seq";

export interface NodeExportOptions {
  /** Output file. For `png-seq`, an output folder. */
  out: string;
  format: NodeExportFormat;
  width?: number;
  height?: number;
  fps?: 24 | 30 | 60;
  /** Time range in milliseconds. Default: the full timeline. */
  range?: { startMs: number; endMs: number };
  style?: RenderOptions["style"];
  /** `draft` is fast with a low bitrate. `high` is slow with a high bitrate. */
  quality?: "draft" | "standard" | "high";
  ffmpegPath?: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface NodeExportResult {
  out: string;
  frames: number;
  durationMs: number;
  bytes: number;
}

export class ExportError extends Error {
  constructor(
    message: string,
    readonly code: "ffmpeg-missing" | "ffmpeg-failed" | "cancelled" | "invalid-range",
  ) {
    super(message);
  }
}

/** Render one frame to a PNG buffer. */
export function renderPng(scene: Scene, timeMs: number, opts: { width?: number; height?: number; style?: RenderOptions["style"] } = {}): Buffer {
  registerBundledAssets();
  const width = opts.width ?? scene.settings.video.width;
  const height = opts.height ?? scene.settings.video.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  renderScene(ctx as unknown as Ctx2D, scene, timeMs, { width, height, ...(opts.style ? { style: opts.style } : {}) });
  return canvas.toBuffer("image/png");
}

function crf(quality: NodeExportOptions["quality"], codec: "x264" | "vp9"): string {
  const table = { x264: { draft: "28", standard: "20", high: "16" }, vp9: { draft: "40", standard: "31", high: "24" } };
  return table[codec][quality ?? "standard"];
}

function ffmpegArgs(o: Required<Pick<NodeExportOptions, "format" | "out">> & { width: number; height: number; fps: number; quality: NodeExportOptions["quality"] }): string[] {
  const input = ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${o.width}x${o.height}`, "-r", String(o.fps), "-i", "-"];
  switch (o.format) {
    case "mp4":
      return [...input, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", crf(o.quality, "x264"), "-preset", o.quality === "draft" ? "veryfast" : "medium", "-movflags", "+faststart", o.out];
    case "webm":
      return [...input, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", crf(o.quality, "vp9"), "-row-mt", "1", o.out];
    case "prores":
      return [...input, "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", o.out];
    case "gif":
      return [...input, "-filter_complex", "[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a", "-loop", "0", o.out];
    case "png-seq":
      throw new Error("png-seq does not use FFmpeg");
  }
}

/**
 * Export a scene with the Node engine (docs/07 "Export procedure").
 * Each frame is rendered offline, so no frame is dropped.
 */
export async function exportVideo(scene: Scene, opts: NodeExportOptions): Promise<NodeExportResult> {
  registerBundledAssets();
  const width = opts.width ?? scene.settings.video.width;
  const height = opts.height ?? scene.settings.video.height;
  const fps = opts.fps ?? scene.settings.video.fps;
  const total = resolveTimeline(scene).totalMs;
  const startMs = opts.range?.startMs ?? 0;
  const endMs = opts.range?.endMs ?? total;
  if (endMs <= startMs) throw new ExportError(`The time range ${startMs}–${endMs} ms is empty. Set an end time after the start time.`, "invalid-range");

  const frames = Math.ceil(((endMs - startMs) * fps) / 1000);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const renderOpts: RenderOptions = { width, height, ...(opts.style ? { style: opts.style } : {}) };
  const renderAt = (i: number) => {
    renderScene(ctx as unknown as Ctx2D, scene, startMs + (i * 1000) / fps, renderOpts);
  };

  if (opts.format === "png-seq") {
    mkdirSync(opts.out, { recursive: true });
    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) throw new ExportError("The export was cancelled.", "cancelled");
      renderAt(i);
      writeFileSync(join(opts.out, `frame-${String(i).padStart(6, "0")}.png`), canvas.toBuffer("image/png"));
      opts.onProgress?.(i + 1, frames);
    }
    return { out: opts.out, frames, durationMs: endMs - startMs, bytes: 0 };
  }

  const ffmpeg = opts.ffmpegPath ?? process.env["ANIVO_FFMPEG"] ?? "ffmpeg";
  const args = ffmpegArgs({ format: opts.format, out: opts.out, width, height, fps, quality: opts.quality });
  const proc = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  // A write to a closed pipe emits an error on stdin. The exit code reports the failure.
  proc.stdin.on("error", () => undefined);

  // Wait until the process starts. A missing binary fails here, before any write.
  await new Promise<void>((resolve, reject) => {
    proc.once("spawn", () => resolve());
    proc.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") reject(new ExportError(`FFmpeg was not found at '${ffmpeg}'. Install FFmpeg, or set ANIVO_FFMPEG to its path.`, "ffmpeg-missing"));
      else reject(err);
    });
  });

  let exitCode: number | undefined;
  const exited = new Promise<number>((resolve) => proc.on("close", (code) => resolve((exitCode = code ?? 1))));

  try {
    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) {
        proc.kill("SIGKILL");
        throw new ExportError("The export was cancelled.", "cancelled");
      }
      if (exitCode !== undefined) break;
      renderAt(i);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      if (!proc.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) {
        await Promise.race([new Promise<void>((resolve) => proc.stdin.once("drain", resolve)), exited]);
      }
      opts.onProgress?.(i + 1, frames);
    }
  } finally {
    proc.stdin.end();
  }

  const code = await exited;
  if (code !== 0) throw new ExportError(`FFmpeg stopped with code ${code}. ${stderr.trim().split("\n").slice(-3).join(" ")}`, "ffmpeg-failed");
  return { out: opts.out, frames, durationMs: endMs - startMs, bytes: statSync(opts.out).size };
}
