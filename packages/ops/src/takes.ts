/**
 * Voice takes for each step (docs/08 "Record step by step"). The voiceover stays
 * one track. A step with a cue on the voiceover owns the audio from its cue to
 * the next cue. A new take of a step replaces that part, and the later cues move
 * by the change in length. The part is never shorter than the animation of the
 * step (and of the steps without a cue after it), so the voice and the
 * animation stay together: when the take is short, silence fills the rest.
 * Pure: the caller cuts and joins the samples.
 */
import { resolveTimeline } from "@anivo/engine";
import { type Scene, trackSpan } from "@anivo/schema";
import { speechIntervals } from "./align.js";
import type { OperationInput } from "./operations.js";

export interface TakePlan {
  /** The voiceover track ID (new or existing). */
  trackId: string;
  /** Output time of the voiceover start. The new audio starts there, with no trim. */
  trackStartMs: number;
  /** Source times in the old voiceover audio: the part that plays, and in it the part that the take replaces. */
  keepFromMs: number;
  keepToMs: number;
  cutFromMs: number;
  cutToMs: number;
  /** Silence before the take (the step starts after the end of the old audio). */
  silenceBeforeMs: number;
  /** Silence after the take, so the part is as long as the animation. */
  silenceAfterMs: number;
  /** The cue of the step and the moved cues of the later steps. */
  ops: OperationInput[];
}

/** The output time of the voiceover part of each step with a cue. */
export function voiceParts(scene: Scene): { stepId: string; fromMs: number; toMs: number }[] {
  const vo = scene.audio.find((t) => t.kind === "voiceover");
  if (!vo) return [];
  const end = trackSpan(vo).endMs;
  const cued = scene.steps.filter((s) => s.trigger.kind === "cue" && s.trigger.audioId === vo.id);
  return cued.map((s, i) => ({ stepId: s.id, fromMs: (s.trigger as { atMs: number }).atMs, toMs: i + 1 < cued.length ? (cued[i + 1]!.trigger as { atMs: number }).atMs : end }));
}

/** Plan a take of `takeMs` for a step. */
export function planTake(scene: Scene, stepId: string, takeMs: number): TakePlan {
  const index = scene.steps.findIndex((s) => s.id === stepId);
  if (index < 0) throw new Error(`Step '${stepId}' does not exist.`);
  const vo = scene.audio.find((t) => t.kind === "voiceover");
  const trackId = vo?.id ?? "voiceover";
  const offset = vo ? vo.trimStartMs - vo.startMs : 0;
  const voiceEnd = vo ? trackSpan(vo).endMs : 0;
  const isCued = (i: number) => {
    const t = scene.steps[i]!.trigger;
    return t.kind === "cue" && t.audioId === trackId;
  };
  const cueOf = (i: number) => (scene.steps[i]!.trigger as { atMs: number }).atMs;
  let next = index + 1;
  while (next < scene.steps.length && !isCued(next)) next++;
  const nextCue = next < scene.steps.length ? cueOf(next) : undefined;

  const timeline = resolveTimeline(scene);
  let silenceBeforeMs = 0;
  let from: number;
  let to: number;
  if (isCued(index)) {
    from = cueOf(index);
    to = nextCue ?? voiceEnd;
  } else if (nextCue !== undefined) {
    from = to = nextCue;
  } else {
    // After the end of the voice: the take starts where the step starts.
    const start = timeline.steps[index]!.startMs;
    silenceBeforeMs = Math.max(0, start - voiceEnd);
    from = to = voiceEnd;
  }
  // The time that this step needs, and before a later cue also the steps without a cue between them.
  let needMs = 0;
  for (let i = index; i < (nextCue === undefined ? index + 1 : next); i++) {
    const t = timeline.steps[i]!;
    needMs += t.holdEndMs - t.startMs;
  }
  const partMs = Math.max(takeMs, needMs);
  const delta = silenceBeforeMs + partMs - (to - from);
  // All cues: a replace of the voiceover track removes the cues on it.
  const cue = (id: string, atMs: number): OperationInput => ({ op: "step.update", id, set: { trigger: { kind: "cue", audioId: trackId, atMs } } });
  const ops: OperationInput[] = [];
  scene.steps.forEach((s, i) => {
    if (i === index) ops.push(cue(s.id, from + silenceBeforeMs));
    else if (isCued(i)) ops.push(cue(s.id, i < index ? cueOf(i) : cueOf(i) + delta));
  });
  return { trackId, trackStartMs: vo?.startMs ?? 0, keepFromMs: vo?.trimStartMs ?? 0, keepToMs: vo ? voiceEnd + offset : 0, cutFromMs: from + offset, cutToMs: to + offset, silenceBeforeMs, silenceAfterMs: partMs - takeMs, ops };
}

/** Remove the silence before and after the speech of a take, and keep `padMs` of it. Throws if the take is silent. */
export function trimTake(take: Float32Array, rate: number, padMs = 250): Float32Array {
  const at = (ms: number) => Math.max(0, Math.round((ms / 1000) * rate));
  const speech = speechIntervals(take, rate);
  if (speech.length > 0) return take.slice(at(speech[0]!.fromMs - padMs), at(speech.at(-1)!.toMs + padMs));
  // No start of speech: a sound with no silence at all, or silence.
  if (take.some((v) => Math.abs(v) > 0.02)) return take;
  throw new Error("The take has no speech. Check the microphone, then record again.");
}

/** The new voiceover samples for a plan: the old audio with the take in place of the part of the step. */
export function spliceTake(old: Float32Array, take: Float32Array, rate: number, plan: TakePlan): Float32Array {
  const at = (ms: number) => Math.min(old.length, Math.max(0, Math.round((ms / 1000) * rate)));
  const len = (ms: number) => Math.max(0, Math.round((ms / 1000) * rate));
  const before = old.slice(at(plan.keepFromMs), at(plan.cutFromMs));
  const after = old.slice(at(plan.cutToMs), at(plan.keepToMs));
  const out = new Float32Array(before.length + len(plan.silenceBeforeMs) + take.length + len(plan.silenceAfterMs) + after.length);
  out.set(before, 0);
  out.set(take, before.length + len(plan.silenceBeforeMs));
  out.set(after, out.length - after.length);
  return out;
}
