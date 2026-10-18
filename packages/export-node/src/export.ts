import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTimeline, sceneCaptions } from "@anivo/engine";
import { type Ctx2D, type RenderOptions, renderScene } from "@anivo/render";
import { type AudioSegment, DUCK_ATTACK_MS, DUCK_RELEASE_MS, type Scene, audioSegments, speechInOutput } from "@anivo/schema";
import { speechIntervals } from "@anivo/ops";
import { createCanvas } from "@napi-rs/canvas";
import { registerBundledAssets } from "./fonts.js";
import { registerSceneImages } from "./images.js";

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
  /** Bytes of the scene assets (audio). Without them, the export has no audio. */
  assets?: Map<string, Uint8Array>;
  /** Set false to export with no audio. */
  audio?: boolean;
  /** Burn the script captions into the video, at this edge. Default: no captions. */
  captions?: "bottom" | "top";
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
export function renderPng(scene: Scene, timeMs: number, opts: { width?: number; height?: number; style?: RenderOptions["style"]; assets?: Map<string, Uint8Array> } = {}): Buffer {
  registerBundledAssets();
  registerSceneImages(scene, opts.assets);
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

/**
 * FFmpeg arguments. Input 0 is the raw video on standard input. Inputs 1..n
 * are the audio files. The filter trims, delays, and sets the gain of each
 * piece, mixes them, and limits the sum to -1 dBFS (docs/08).
 */
/** When the voiceover speaks, in output time (for ducking). FFmpeg decodes the voiceover piece. */
function voiceSpeech(scene: Scene, audio: { file: string; seg: AudioSegment }[], ffmpeg: string): { fromMs: number; toMs: number }[] {
  const voiceId = scene.audio.find((t) => t.kind === "voiceover")?.id;
  const v = audio.find((a) => a.seg.trackId === voiceId);
  if (!v) return [];
  const r = spawnSync(ffmpeg, ["-v", "error", "-i", v.file, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0 || !r.stdout) return [];
  const b = r.stdout as Buffer;
  return speechInOutput(v.seg, speechIntervals(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4)), 16000));
}

/** FFmpeg volume expression of the ducking: 1 outside speech, the duck gain in speech, with ramps. */
export function duckExpression(speech: { fromMs: number; toMs: number }[], duckDb: number): string {
  if (speech.length === 0) return "1";
  const g = 10 ** (duckDb / 20);
  const a = DUCK_ATTACK_MS / 1000;
  const r = DUCK_RELEASE_MS / 1000;
  const trap = (s: { fromMs: number; toMs: number }) => `clip(min((t-${(s.fromMs / 1000 - a).toFixed(3)})/${a},(${(s.toMs / 1000 + r).toFixed(3)}-t)/${r}),0,1)`;
  const duck = speech.map(trap).reduce((acc, x) => `max(${acc},${x})`);
  return `1-${(1 - g).toFixed(4)}*${duck}`;
}

function ffmpegArgs(o: Required<Pick<NodeExportOptions, "format" | "out">> & { width: number; height: number; fps: number; quality: NodeExportOptions["quality"]; audio: { file: string; seg: AudioSegment }[]; durationMs: number; speech: { fromMs: number; toMs: number }[] }): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${o.width}x${o.height}`, "-r", String(o.fps), "-i", "-"];
  const withAudio = o.audio.length > 0 && o.format !== "gif";
  if (withAudio) for (const a of o.audio) args.push("-i", a.file);
  const filters: string[] = [];
  if (withAudio) {
    o.audio.forEach(({ seg }, k) => {
      const delay = Math.round(seg.atMs);
      filters.push(`[${k + 1}:a]atrim=start=${seg.fromMs / 1000}:end=${seg.toMs / 1000},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}|${delay},volume=${seg.gainDb}dB${seg.duckDb !== undefined && o.speech.length ? `,volume=eval=frame:volume='${duckExpression(o.speech, seg.duckDb)}'` : ""}[a${k}]`);
    });
    const ins = o.audio.map((_, k) => `[a${k}]`).join("");
    filters.push(`${ins}amix=inputs=${o.audio.length}:normalize=0:duration=longest,alimiter=limit=0.891:level=false[aout]`);
  }
  const audioOut = (codec: string[]) => (withAudio ? ["-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[aout]", ...codec, "-t", String(o.durationMs / 1000)] : []);
  switch (o.format) {
    case "mp4":
      return [...args, ...audioOut(["-c:a", "aac", "-b:a", "192k"]), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", crf(o.quality, "x264"), "-preset", o.quality === "draft" ? "veryfast" : "medium", "-movflags", "+faststart", o.out];
    case "webm":
      return [...args, ...audioOut(["-c:a", "libopus", "-b:a", "128k"]), "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", crf(o.quality, "vp9"), "-row-mt", "1", o.out];
    case "prores":
      return [...args, ...audioOut(["-c:a", "pcm_s16le"]), "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", o.out];
    case "gif":
      return [...args, "-filter_complex", "[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a", "-loop", "0", o.out];
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
  registerSceneImages(scene, opts.assets);
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
  const renderOpts: RenderOptions = {
    width,
    height,
    ...(opts.style ? { style: opts.style } : {}),
    ...(opts.captions ? { captions: { list: sceneCaptions(scene), position: opts.captions } } : {}),
  };
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
  // Write the audio pieces that the range uses to temporary files for FFmpeg.
  const segments = opts.audio === false || !opts.assets ? [] : audioSegments(scene, startMs, endMs).filter((s) => opts.assets!.has(s.assetId));
  const tmp = segments.length ? mkdtempSync(join(tmpdir(), "anivo-audio-")) : undefined;
  const audio = segments.map((seg) => {
    const file = join(tmp!, `${seg.assetId}`);
    writeFileSync(file, opts.assets!.get(seg.assetId)!);
    return { file, seg };
  });
  const speech = segments.some((sg) => sg.duckDb !== undefined) ? voiceSpeech(scene, audio, ffmpeg) : [];
  const args = ffmpegArgs({ format: opts.format, out: opts.out, width, height, fps, quality: opts.quality, audio, durationMs: endMs - startMs, speech });
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
        if (tmp) rmSync(tmp, { recursive: true, force: true });
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
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (code !== 0) throw new ExportError(`FFmpeg stopped with code ${code}. ${stderr.trim().split("\n").slice(-3).join(" ")}`, "ffmpeg-failed");
  return { out: opts.out, frames, durationMs: endMs - startMs, bytes: statSync(opts.out).size };
}
