// gifenc has no types. The reference makes the declarations visible to every project that imports this file.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./gifenc.d.ts" />
import { resolveTimeline } from "@anivo/engine";
import { type Ctx2D, type RenderOptions, renderScene } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { WebExportError } from "./export.js";

export interface GifExportOptions {
  width?: number;
  height?: number;
  fps?: number;
  range?: { startMs: number; endMs: number };
  style?: RenderOptions["style"];
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Rough GIF size in bytes, for the size estimate before export (FR-EXPORT-03). */
export function estimateGifBytes(width: number, height: number, frames: number): number {
  // Diagram frames compress well: about 0.06 bytes per pixel per frame.
  return Math.round(width * height * frames * 0.06);
}

/**
 * Export a GIF in the browser (docs/07 "GIF export"): one palette for the
 * full GIF from a sample of frames, then each frame mapped to that palette.
 */
export async function exportGifWeb(scene: Scene, opts: GifExportOptions = {}): Promise<{ data: Uint8Array; frames: number }> {
  const width = opts.width ?? 800;
  const height = opts.height ?? Math.round((width * scene.settings.video.height) / scene.settings.video.width);
  const fps = Math.min(30, Math.max(5, opts.fps ?? 15));
  const total = resolveTimeline(scene).totalMs;
  const startMs = opts.range?.startMs ?? 0;
  const endMs = opts.range?.endMs ?? total;
  if (endMs <= startMs) throw new WebExportError(`The time range ${startMs}–${endMs} ms is empty. Set an end time after the start time.`, "invalid-range");
  const frames = Math.ceil(((endMs - startMs) * fps) / 1000);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const renderOpts: RenderOptions = { width, height, ...(opts.style ? { style: opts.style } : {}) };
  const pixelsAt = (i: number) => {
    renderScene(ctx as unknown as Ctx2D, scene, startMs + (i * 1000) / fps, renderOpts);
    return ctx.getImageData(0, 0, width, height).data;
  };

  // Palette from about 1 frame in 10 (at most 24 frames), joined into one buffer.
  const sampleEvery = Math.max(1, Math.ceil(frames / 24));
  const samples: Uint8ClampedArray[] = [];
  for (let i = 0; i < frames; i += sampleEvery) samples.push(pixelsAt(i));
  const joined = new Uint8ClampedArray(samples.reduce((n, s) => n + s.length, 0));
  let off = 0;
  for (const s of samples) {
    joined.set(s, off);
    off += s.length;
  }
  const palette = quantize(joined, 256);

  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames; i++) {
    if (opts.signal?.aborted) throw new WebExportError("The export was cancelled.", "cancelled");
    const index = applyPalette(pixelsAt(i), palette);
    gif.writeFrame(index, width, height, { palette, delay });
    opts.onProgress?.(i + 1, frames);
    // Give the UI a chance to update and to accept a cancel.
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return { data: gif.bytes(), frames };
}

/** One PNG of the scene at a time. */
export async function renderPngWeb(scene: Scene, timeMs: number, width: number, height: number, style?: RenderOptions["style"]): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  renderScene(ctx as unknown as Ctx2D, scene, timeMs, { width, height, ...(style ? { style } : {}) });
  return canvas.convertToBlob({ type: "image/png" });
}
