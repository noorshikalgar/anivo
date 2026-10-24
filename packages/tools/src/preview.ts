import { resolveTimeline } from "@anivo/engine";
import { registerBundledAssets, registerSceneImages } from "@anivo/export-node";
import { evaluateWithLayout, frameBox } from "@anivo/layout";
import { type Ctx2D, renderFrame } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import { type Canvas, createCanvas } from "@napi-rs/canvas";
import { ToolError, assetCache } from "./files.js";

export interface PreviewOptions {
  /** Step number (1-based) or step ID. Default: the last step. 0 is the base state. */
  step?: number | string;
  /** "end" (default), "start", or a time in milliseconds from the step start. */
  at?: "end" | "start" | number;
  /** Image width in pixels (maximum 1920). Default 960. */
  width?: number;
  /** Draw element IDs on the image. */
  debug?: boolean;
}

/** Time for a step position. */
export function stepTime(scene: Scene, step: number | string | undefined, at: PreviewOptions["at"] = "end"): number {
  const tl = resolveTimeline(scene);
  if (step === 0 || step === "0" || step === "base") return -1;
  let i: number;
  if (step === undefined) i = tl.steps.length - 1;
  else if (typeof step === "number" || /^\d+$/.test(String(step))) i = Number(step) - 1;
  else i = scene.steps.findIndex((s) => s.id === step);
  const t = tl.steps[i];
  if (!t) throw new ToolError(`The step '${step}' does not exist.`, `Use a number from 0 (base) to ${tl.steps.length}, or one of: ${scene.steps.map((s) => s.id).join(", ")}.`);
  if (at === "start") return t.startMs;
  // The end shows the caption typed in full, too.
  if (at === "end") return Math.max(t.startMs, Math.max(t.endMs, t.caption?.typedMs ?? 0) - 1);
  return t.startMs + at;
}

/** Render one frame on a new canvas. The renderer sets its own transform, so each image has its own canvas. */
function frameCanvas(scene: Scene, timeMs: number, width: number, height: number, debug: boolean): Canvas {
  registerSceneImages(scene, assetCache);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as Ctx2D;
  const { frame, routes } = evaluateWithLayout(scene, timeMs);
  renderFrame(ctx, scene, frame, routes, { width, height });
  if (!debug) return canvas;
  // Element IDs in small yellow labels (FR-AGENT-05).
  const cam = frame.camera;
  const sx = width / cam.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const size = Math.max(10, Math.round(13 * (width / 960)));
  ctx.font = `600 ${size}px "Inter"`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  for (const f of frame.elements) {
    if (!f.visible || f.type === "group") continue;
    let x: number;
    let y: number;
    if (f.type === "connector") {
      const r = routes.get(f.id);
      const mid = r?.points[Math.floor(r.points.length / 2)];
      if (!mid) continue;
      [x, y] = [mid.x, mid.y];
    } else {
      const b = frameBox(f);
      [x, y] = [b.x, b.y];
    }
    const px = (x - cam.x) * sx;
    const py = (y - cam.y) * sx;
    ctx.fillStyle = "rgba(250, 204, 21, 0.9)";
    ctx.fillRect(px, py - 2, ctx.measureText(f.id).width + 6, size + 4);
    ctx.fillStyle = "#111111";
    ctx.fillText(f.id, px + 3, py);
  }
  return canvas;
}

/** One frame as PNG (docs/09 anivo_preview). */
export function previewPng(scene: Scene, opts: PreviewOptions = {}): Buffer {
  registerBundledAssets();
  const width = Math.min(1920, opts.width ?? 960);
  const height = Math.round((width * scene.settings.video.height) / scene.settings.video.width);
  return frameCanvas(scene, stepTime(scene, opts.step, opts.at), width, height, opts.debug ?? false).toBuffer("image/png");
}

/**
 * One PNG with the end state of each step in a grid, with step titles
 * (docs/09 anivo_contact_sheet). An agent sees the full video in one image.
 */
export function contactSheetPng(scene: Scene, opts: { cols?: number; cellWidth?: number; debug?: boolean } = {}): Buffer {
  registerBundledAssets();
  const n = Math.max(1, scene.steps.length);
  const cols = opts.cols ?? Math.min(3, n);
  const rows = Math.ceil(n / cols);
  const cw = opts.cellWidth ?? Math.min(640, Math.floor(1280 / cols));
  const ch = Math.round((cw * scene.settings.video.height) / scene.settings.video.width);
  const title = 26;
  const gap = 8;
  const canvas = createCanvas(cols * cw + (cols + 1) * gap, rows * (ch + title) + (rows + 1) * gap);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1f2328";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (scene.steps.length === 0) {
    ctx.drawImage(frameCanvas(scene, -1, cw, ch, opts.debug ?? false), gap, gap + title);
    return canvas.toBuffer("image/png");
  }
  scene.steps.forEach((st, i) => {
    const x = gap + (i % cols) * (cw + gap);
    const y = gap + Math.floor(i / cols) * (ch + title + gap);
    ctx.fillStyle = "#e6edf3";
    ctx.font = '600 14px "Inter"';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${i + 1}. ${st.title || st.id}`.slice(0, 60), x + 2, y + title / 2);
    ctx.drawImage(frameCanvas(scene, stepTime(scene, i + 1), cw, ch, opts.debug ?? false), x, y + title);
  });
  return canvas.toBuffer("image/png");
}

/**
 * A filmstrip (docs/26 M1): frames from the start of one step to the end of
 * its hold, in one PNG, to check how a step moves without a video.
 */
export function filmstripPng(scene: Scene, step: number, opts: { count?: number; cols?: number; cellWidth?: number; debug?: boolean } = {}): Buffer {
  registerBundledAssets();
  const tl = resolveTimeline(scene);
  const ts = tl.steps[step - 1];
  if (!ts) throw new ToolError(`The scene has no step ${step}.`, `Use a step from 1 to ${tl.steps.length}.`);
  const n = Math.max(2, Math.min(24, opts.count ?? 6));
  const cols = opts.cols ?? Math.min(3, n);
  const rows = Math.ceil(n / cols);
  const cw = opts.cellWidth ?? Math.min(640, Math.floor(1280 / cols));
  const ch = Math.round((cw * scene.settings.video.height) / scene.settings.video.width);
  const title = 22;
  const gap = 8;
  const canvas = createCanvas(cols * cw + (cols + 1) * gap, rows * (ch + title) + (rows + 1) * gap);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1f2328";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const end = Math.max(ts.startMs + 1, ts.holdEndMs - 1);
  for (let i = 0; i < n; i++) {
    const t = ts.startMs + ((end - ts.startMs) * i) / (n - 1);
    const x = gap + (i % cols) * (cw + gap);
    const y = gap + Math.floor(i / cols) * (ch + title + gap);
    ctx.fillStyle = "#e6edf3";
    ctx.font = '600 13px "Inter"';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`step ${step} +${((t - ts.startMs) / 1000).toFixed(2)} s`, x + 2, y + title / 2);
    ctx.drawImage(frameCanvas(scene, t, cw, ch, opts.debug ?? false), x, y + title);
  }
  return canvas.toBuffer("image/png");
}
