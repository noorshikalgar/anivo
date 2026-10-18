import { resolveTimeline, sceneCaptions } from "@anivo/engine";
import { type Ctx2D, type RenderOptions, renderScene } from "@anivo/render";
import { DUCK_ATTACK_MS, DUCK_RELEASE_MS, type Scene, audioSegments, speechInOutput } from "@anivo/schema";
import { speechIntervals } from "@anivo/ops";
import { decodeSceneImages } from "./images.js";
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  WebMOutputFormat,
  canEncodeAudio,
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
  /** Asset bytes by asset ID. Audio tracks with bytes here are mixed into the video. */
  assets?: Map<string, Uint8Array>;
  /** Set false to export with no sound. Default true. */
  audio?: boolean;
  /** Burn the script captions into the video, at this edge. Default: no captions. */
  captions?: "bottom" | "top";
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

  await decodeSceneImages(scene, opts.assets);
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
  const mix = opts.audio === false ? null : await mixAudio(scene, opts.assets, startMs, endMs);
  let audioSource: AudioBufferSource | null = null;
  if (mix) {
    const audioCodec = opts.format === "mp4" ? "aac" : "opus";
    if (await canEncodeAudio(audioCodec)) {
      audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: opts.format === "mp4" ? 192_000 : 128_000 });
      output.addAudioTrack(audioSource);
    }
  }
  await output.start();
  if (audioSource && mix) await audioSource.add(mix);

  const frames = Math.ceil(((endMs - startMs) * fps) / 1000);
  const renderOpts: RenderOptions = {
    width,
    height,
    ...(opts.style ? { style: opts.style } : {}),
    ...(opts.captions ? { captions: { list: sceneCaptions(scene), position: opts.captions } } : {}),
  };
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

const SAMPLE_RATE = 48_000;

/** The first channel at 16 kHz (nearest sample), for speech detection. */
export function monoAt16k(b: AudioBuffer): Float32Array {
  const src = b.getChannelData(0);
  const step = b.sampleRate / 16000;
  const out = new Float32Array(Math.floor(src.length / step));
  for (let i = 0; i < out.length; i++) out[i] = src[Math.floor(i * step)]!;
  return out;
}

/** Gain ramps for ducking (the same shape as the CLI export). */
export function duck(param: AudioParam, base: number, duckDb: number, speech: { fromMs: number; toMs: number }[], offsetS = 0): void {
  const low = base * 10 ** (duckDb / 20);
  for (const s of speech) {
    const a = Math.max(0, s.fromMs / 1000 - DUCK_ATTACK_MS / 1000 + offsetS);
    param.setValueAtTime(base, a);
    param.linearRampToValueAtTime(low, s.fromMs / 1000 + offsetS);
    param.setValueAtTime(low, s.toMs / 1000 + offsetS);
    param.linearRampToValueAtTime(base, s.toMs / 1000 + DUCK_RELEASE_MS / 1000 + offsetS);
  }
}

/**
 * Mix the audio tracks of the range into one stereo buffer (trim, delay, gain),
 * with a soft limit at -1 dBFS. Gives null when no track has sound in the range.
 */
export async function mixAudio(scene: Scene, assets: Map<string, Uint8Array> | undefined, startMs: number, endMs: number): Promise<AudioBuffer | null> {
  if (!assets || typeof OfflineAudioContext === "undefined") return null;
  const segs = audioSegments(scene, startMs, endMs).filter((s) => assets.has(s.assetId));
  if (segs.length === 0) return null;
  const length = Math.ceil(((endMs - startMs) / 1000) * SAMPLE_RATE);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: SAMPLE_RATE });
  const decoded = new Map<string, AudioBuffer>();
  for (const seg of segs) {
    if (!decoded.has(seg.assetId)) {
      const bytes = assets.get(seg.assetId)!;
      decoded.set(seg.assetId, await ctx.decodeAudioData(bytes.slice().buffer));
    }
  }
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  limiter.connect(ctx.destination);
  // Ducking: when the voiceover speaks, music and sound effects get quieter.
  const voiceId = scene.audio.find((t) => t.kind === "voiceover")?.id;
  const voice = segs.find((s) => s.trackId === voiceId);
  const speech = voice && segs.some((s) => s.duckDb !== undefined) ? speechInOutput(voice, speechIntervals(monoAt16k(decoded.get(voice.assetId)!), 16000)) : [];
  for (const seg of segs) {
    const node = ctx.createBufferSource();
    node.buffer = decoded.get(seg.assetId)!;
    const gain = ctx.createGain();
    gain.gain.value = 10 ** (seg.gainDb / 20);
    if (seg.duckDb !== undefined) duck(gain.gain, 10 ** (seg.gainDb / 20), seg.duckDb, speech);
    node.connect(gain).connect(limiter);
    node.start(seg.atMs / 1000, seg.fromMs / 1000, (seg.toMs - seg.fromMs) / 1000);
  }
  return ctx.startRendering();
}
