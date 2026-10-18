/**
 * Captions from the script (docs/08 "Captions", FR-AUDIO-09).
 * Each script line that links to a step is one caption or more. Pure and deterministic.
 */
import type { Scene } from "@anivo/schema";
import { type Timeline, resolveTimeline } from "./timeline.js";

export interface Caption {
  startMs: number;
  endMs: number;
  /** One or two text lines. */
  lines: string[];
}

export const CAPTION_LINE_CHARS = 42;
/** A caption stays on screen for this time at least, if the next caption permits it. */
const MIN_MS = 700;

/** Divide text into lines of at most `max` characters, at word boundaries. A longer word gets its own line. */
export function wrapCaption(text: string, max = CAPTION_LINE_CHARS): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

export function sceneCaptions(scene: Scene, timeline: Timeline = resolveTimeline(scene)): Caption[] {
  const startOf = new Map(timeline.steps.map((s) => [s.id, s]));
  const words = scene.audio.find((t) => t.kind === "voiceover")?.transcript?.words ?? [];
  const voice = scene.audio.find((t) => t.kind === "voiceover");
  // Transcript word times are in source time; move them to video time.
  const wordEnds = voice ? words.map((w) => w.endMs - voice.trimStartMs + voice.startMs) : [];

  const timed = scene.script
    .flatMap((line) => {
      const step = line.stepId ? startOf.get(line.stepId) : undefined;
      return step && line.text.trim() ? [{ text: line.text, startMs: step.startMs, stepEnd: step.holdEndMs }] : [];
    })
    .sort((a, b) => a.startMs - b.startMs);

  const out: Caption[] = [];
  timed.forEach((line, i) => {
    const next = timed[i + 1]?.startMs ?? Math.max(line.stepEnd, timeline.totalMs);
    let endMs = next;
    // End at the last spoken word before the next line, if the transcript has one.
    const spoken = wordEnds.filter((e) => e > line.startMs && e <= next);
    if (spoken.length > 0) endMs = Math.min(next, Math.max(spoken[spoken.length - 1]!, line.startMs + MIN_MS));
    if (endMs <= line.startMs) return;
    const lines = wrapCaption(line.text);
    // More than 2 lines: divide the time between the parts by their character count.
    const parts: string[][] = [];
    for (let j = 0; j < lines.length; j += 2) parts.push(lines.slice(j, j + 2));
    const chars = parts.map((p) => p.join(" ").length);
    const sum = chars.reduce((a, b) => a + b, 0);
    let t = line.startMs;
    parts.forEach((p, j) => {
      const end = j === parts.length - 1 ? endMs : Math.round(t + ((endMs - line.startMs) * chars[j]!) / sum);
      out.push({ startMs: t, endMs: end, lines: p });
      t = end;
    });
  });
  return out;
}

/** The caption at a time, or undefined. */
export function captionAt(captions: Caption[], timeMs: number): Caption | undefined {
  return captions.find((c) => timeMs >= c.startMs && timeMs < c.endMs);
}

function stamp(ms: number, sep: "," | "."): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor(t / 60_000) % 60;
  const s = Math.floor(t / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(t % 1000, 3)}`;
}

/** Captions in a time range, with times from the start of the range. */
function inRange(captions: Caption[], range?: { startMs: number; endMs: number }): Caption[] {
  if (!range) return captions;
  return captions
    .filter((c) => c.endMs > range.startMs && c.startMs < range.endMs)
    .map((c) => ({ ...c, startMs: Math.max(c.startMs, range.startMs) - range.startMs, endMs: Math.min(c.endMs, range.endMs) - range.startMs }));
}

export function toSrt(captions: Caption[], range?: { startMs: number; endMs: number }): string {
  return inRange(captions, range)
    .map((c, i) => `${i + 1}\n${stamp(c.startMs, ",")} --> ${stamp(c.endMs, ",")}\n${c.lines.join("\n")}\n`)
    .join("\n");
}

export function toVtt(captions: Caption[], range?: { startMs: number; endMs: number }): string {
  const cues = inRange(captions, range).map((c) => `${stamp(c.startMs, ".")} --> ${stamp(c.endMs, ".")}\n${c.lines.join("\n").replace(/-->/g, "→")}\n`);
  return `WEBVTT\n\n${cues.join("\n")}`;
}
