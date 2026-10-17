import { resolveTimeline } from "@anivo/engine";
import { type Ctx2D, type RenderOptions, renderScene } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  WebMOutputFormat,
  canEncodeVideo,
} from "mediabunny";

export type WebExportFormat = "mp4" | "webm";

export interface WebExportOptions {
  format: WebExportFormat;
  width?: number;
  height?: number;
  fps?: 24 | 30 | 60;
  range?: { startMs: number; endMs: number };
  style?: RenderOptions["style"];
  quality?: "draft" | "standard" | "high";
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface WebExportResult {
  data: Uint8Array;
  mimeType: string;
  frames: number;
  durationMs: number;
}

export class WebExportError extends Error {
  constructor(
    message: string,
    readonly code: "codec-unsupported" | "cancelled" | "invalid-range",
  ) {
    super(message);
  }
}

const CODEC = { mp4: "avc", webm: "vp9" } as const;

/** Formats that this browser can encode at the given size (docs/07 "Browser support"). */
export async function supportedFormats(width = 1920, height = 1080): Promise<WebExportFormat[]> {
  const out: WebExportFormat[] = [];
  for (const format of ["mp4", "webm"] as const) {
    if (await canEncodeVideo(CODEC[format], { width, height })) out.push(format);
  }
  return out;
}

/**
 * Export a scene in the browser with WebCodecs. Each frame is rendered
 * offline, so no frame is dropped (docs/07 "Export procedure").
 */
export async function exportVideoWeb(scene: Scene, opts: WebExportOptions): Promise<WebExportResult> {
  const width = opts.width ?? scene.settings.video.width;
  const height = opts.height ?? scene.settings.video.height;
  const fps = opts.fps ?? scene.settings.video.fps;
  const total = resolveTimeline(scene).totalMs;
  const startMs = opts.range?.startMs ?? 0;
  const endMs = opts.range?.endMs ?? total;
  if (endMs <= startMs) throw new WebExportError(`The time range ${startMs}–${endMs} ms is empty. Set an end time after the start time.`, "invalid-range");

  const codec = CODEC[opts.format];
  if (!(await canEncodeVideo(codec, { width, height }))) {
    const other = opts.format === "mp4" ? "WebM" : "MP4";
    throw new WebExportError(`This browser cannot encode ${opts.format.toUpperCase()} at ${width}×${height}. Use ${other}, or use the CLI.`, "codec-unsupported");
  }

  const transparent = scene.settings.background.kind === "transparent";
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: transparent });
  if (!ctx) throw new Error("The browser did not give a 2D canvas context.");

  const quality = opts.quality === "draft" ? QUALITY_LOW : opts.quality === "high" ? QUALITY_HIGH : QUALITY_MEDIUM;
  const target = new BufferTarget();
  const output = new Output({
    format: opts.format === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec,
    bitrate: quality,
    latencyMode: "quality",
    alpha: opts.format === "webm" && transparent ? "keep" : "discard",
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const frames = Math.ceil(((endMs - startMs) * fps) / 1000);
  const renderOpts: RenderOptions = { width, height, ...(opts.style ? { style: opts.style } : {}) };
  try {
    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) throw new WebExportError("The export was cancelled.", "cancelled");
      renderScene(ctx as unknown as Ctx2D, scene, startMs + (i * 1000) / fps, renderOpts);
      // The promise respects encoder backpressure.
      await source.add(i / fps, 1 / fps);
      opts.onProgress?.(i + 1, frames);
    }
    await output.finalize();
  } catch (err) {
    await output.cancel();
    throw err;
  }

  const buffer = target.buffer;
  if (!buffer) throw new Error("The encoder did not give any data.");
  return { data: new Uint8Array(buffer), mimeType: output.format.mimeType, frames, durationMs: endMs - startMs };
}
