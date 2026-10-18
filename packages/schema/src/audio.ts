import * as z from "zod";
import { Ms, StepId } from "./primitives.js";

/** A binary file of the scene (audio, later images). The bytes live outside the scene, keyed by ID. */
export const AssetRef = z.object({
  id: z.string().regex(/^[0-9a-f]{16}$/).describe("Content hash of the file (16 hex characters)."),
  mime: z.string().describe("Media type, for example audio/mpeg."),
  bytes: z.number().int().nonnegative(),
  name: z.string().optional().describe("Original file name."),
});
export type AssetRef = z.infer<typeof AssetRef>;

export const TranscriptWord = z.object({ text: z.string(), startMs: Ms, endMs: Ms });
export type TranscriptWord = z.infer<typeof TranscriptWord>;

/** An audio track (docs/08 "Tracks"). */
export const AudioTrack = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  kind: z.enum(["voiceover", "music", "sfx"]),
  assetId: z.string(),
  /** Length of the source audio, in milliseconds. */
  durationMs: Ms,
  startMs: Ms.default(0).describe("Time in the video when the track starts."),
  gainDb: z.number().min(-60).max(12).default(0),
  duckDb: z.number().min(-40).max(0).optional().describe("Music and sound: the volume change while the voiceover speaks (ducking), for example -12. Omit for no ducking."),
  trimStartMs: Ms.default(0),
  trimEndMs: Ms.optional(),
  transcript: z.object({ words: z.array(TranscriptWord) }).optional(),
});
export type AudioTrack = z.infer<typeof AudioTrack>;

/** One line of the voiceover script. A line can link to a step (docs/08). */
export const ScriptLine = z.object({
  id: z.string(),
  text: z.string(),
  stepId: StepId.optional(),
  /** Set when alignment could not find the line in the transcript. */
  unmatched: z.boolean().optional(),
});
export type ScriptLine = z.infer<typeof ScriptLine>;

/** The part of a track that plays, in video time: [start, end). */
export function trackSpan(t: AudioTrack): { startMs: number; endMs: number } {
  const end = t.trimEndMs ?? t.durationMs;
  return { startMs: t.startMs, endMs: t.startMs + Math.max(0, end - t.trimStartMs) };
}

/** One audio piece of an export: which part of a source plays at which output time. */
export interface AudioSegment {
  trackId: string;
  assetId: string;
  mime: string;
  /** Output time where the piece starts, from the start of the export range. */
  atMs: number;
  /** Part of the source file that plays. */
  fromMs: number;
  toMs: number;
  gainDb: number;
  /** Ducking under the voiceover, in dB (music and sound effects). */
  duckDb?: number;
}

/**
 * The audio pieces for an export of [startMs, endMs) (docs/08 "Audio mix for
 * export"). Tracks that do not overlap the range are left out.
 */
export function audioSegments(scene: { audio: AudioTrack[]; assets: Record<string, AssetRef> }, startMs: number, endMs: number): AudioSegment[] {
  const out: AudioSegment[] = [];
  for (const t of scene.audio) {
    const span = trackSpan(t);
    const a = Math.max(span.startMs, startMs);
    const b = Math.min(span.endMs, endMs);
    if (b <= a) continue;
    const asset = scene.assets[t.assetId];
    if (!asset) continue;
    out.push({ trackId: t.id, assetId: t.assetId, mime: asset.mime, atMs: a - startMs, fromMs: t.trimStartMs + (a - span.startMs), toMs: t.trimStartMs + (b - span.startMs), gainDb: t.gainDb, ...(t.duckDb !== undefined && t.duckDb < 0 && t.kind !== "voiceover" ? { duckDb: t.duckDb } : {}) });
  }
  return out;
}

/** Times (ms, output time) when the voiceover speaks, from speech intervals in the voiceover source. */
export function speechInOutput(voice: AudioSegment, intervals: { fromMs: number; toMs: number }[]): { fromMs: number; toMs: number }[] {
  return intervals.flatMap((iv) => {
    const a = Math.max(iv.fromMs, voice.fromMs);
    const b = Math.min(iv.toMs, voice.toMs);
    return b > a ? [{ fromMs: voice.atMs + (a - voice.fromMs), toMs: voice.atMs + (b - voice.fromMs) }] : [];
  });
}

/** Ducking ramps: the volume goes down 150 ms before speech and back up in 400 ms after it. */
export const DUCK_ATTACK_MS = 150;
export const DUCK_RELEASE_MS = 400;
