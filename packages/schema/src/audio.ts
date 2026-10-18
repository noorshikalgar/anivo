import { z } from "zod";
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
