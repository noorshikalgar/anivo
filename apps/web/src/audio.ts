/**
 * Audio in the editor (docs/08): import, waveform peaks, and playback in sync with the playhead.
 * The bytes are in the store (`assets`); the scene has only the references.
 */
import { assetId } from "@anivo/fileio";
import type { OperationInput } from "@anivo/ops";
import { type AudioTrack, type ScriptLine, audioSegments, speechInOutput } from "@anivo/schema";
import { speechIntervals } from "@anivo/ops";
import { type SoundName, soundCues, synthSound } from "@anivo/engine";
import { duck, monoAt16k } from "@anivo/export-web";
import { useEditor } from "./store.js";

const MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", webm: "audio/webm" };
const MAX_MS = 30 * 60 * 1000;

export class AudioError extends Error {}

let ctx: AudioContext | null = null;
const audioContext = () => (ctx ??= new AudioContext());

/** Decoded audio by asset ID. Decoding is slow, so each file is decoded one time. */
const decoded = new Map<string, Promise<AudioBuffer>>();

export function decode(id: string): Promise<AudioBuffer> | null {
  const bytes = useEditor.getState().assets.get(id);
  if (!bytes) return null;
  let p = decoded.get(id);
  if (!p) {
    p = audioContext().decodeAudioData(bytes.slice().buffer);
    p.catch(() => decoded.delete(id));
    decoded.set(id, p);
  }
  return p;
}

/** Media type from the file type or the file name. */
export function mimeOf(name: string, type: string): string {
  if (type.startsWith("audio/")) return type;
  const mime = MIME[name.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime) throw new AudioError(`The file '${name}' has a type that Anivo does not read. Use an MP3, WAV, M4A, OGG, or FLAC file.`);
  return mime;
}

/**
 * Add an audio file to the scene. A new voiceover replaces the old voiceover.
 * Returns the track ID.
 */
export async function addAudio(
  bytes: Uint8Array,
  name: string,
  type: string,
  kind: AudioTrack["kind"],
  /** More operations in the same transaction (one undo step), for the new track ID. */
  more: (trackId: string) => OperationInput[] = () => [],
): Promise<string> {
  const mime = mimeOf(name, type);
  let buffer: AudioBuffer;
  try {
    buffer = await audioContext().decodeAudioData(bytes.slice().buffer);
  } catch {
    throw new AudioError(`The file '${name}' is not a valid audio file, or this browser cannot read it. Use an MP3, WAV, M4A, OGG, or FLAC file.`);
  }
  const durationMs = Math.round(buffer.duration * 1000);
  if (durationMs > MAX_MS) throw new AudioError("The audio is longer than 30 minutes. Use a shorter file.");
  const id = assetId(bytes);
  decoded.set(id, Promise.resolve(buffer));
  const st = useEditor.getState();
  const old = kind === "voiceover" ? st.scene.audio.find((t) => t.kind === "voiceover") : undefined;
  // The bytes go into the store before the operation, so the asset is never missing.
  useEditor.setState({ assets: new Map(st.assets).set(id, bytes) });
  const trackId = kind === "voiceover" ? (old?.id ?? "voiceover") : undefined;
  const r = st.apply({
    label: kind === "voiceover" ? "Add voiceover" : "Add audio",
    ops: [
      ...(old ? [{ op: "audio.remove" as const, id: old.id }] : []),
      { op: "asset.add", asset: { id, mime, bytes: bytes.length, name } },
      { op: "audio.add", track: { ...(trackId ? { id: trackId } : {}), kind, assetId: id, durationMs, startMs: old?.startMs ?? 0 } },
      ...(trackId ? more(trackId) : []),
    ],
  });
  if (!r.ok) throw new AudioError(r.error.message);
  return trackId ?? r.created[0] ?? "";
}

/** Ask the user for an audio file and add it. Returns false if the user cancelled. */
export async function importAudio(kind: AudioTrack["kind"]): Promise<boolean> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.mp3,.wav,.m4a,.ogg,.flac";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return false;
  await addAudio(new Uint8Array(await file.arrayBuffer()), file.name, file.type, kind);
  return true;
}

/** Peak levels (0 to 1) of `count` equal parts of the buffer, for a waveform. */
export function peaks(buffer: AudioBuffer, count: number): Float32Array {
  const out = new Float32Array(count);
  const data = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const size = buffer.length / count;
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * size);
    const b = Math.max(a + 1, Math.floor((i + 1) * size));
    let m = 0;
    for (const ch of data) for (let j = a; j < b; j += 4) m = Math.max(m, Math.abs(ch[j] ?? 0));
    out[i] = m;
  }
  return out;
}

// --- playback ------------------------------------------------------------------

let playing: AudioScheduledSourceNode[] = [];

const soundBuffers = new Map<string, AudioBuffer>();
function soundBuffer(ac: AudioContext, name: SoundName): AudioBuffer {
  let b = soundBuffers.get(name);
  if (!b) {
    const samples = synthSound(name, ac.sampleRate);
    b = ac.createBuffer(1, samples.length, ac.sampleRate);
    b.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    soundBuffers.set(name, b);
  }
  return b;
}

const speechIntervalsCache = new Map<string, { fromMs: number; toMs: number }[]>();
function speechCache(assetId: string, b: AudioBuffer) {
  let v = speechIntervalsCache.get(assetId);
  if (!v) speechIntervalsCache.set(assetId, (v = speechIntervals(monoAt16k(b), 16000)));
  return v;
}

function stop(): void {
  for (const n of playing) n.stop();
  playing = [];
}

async function start(fromMs: number): Promise<void> {
  stop();
  const { scene, timeline } = useEditor.getState();
  const segs = audioSegments(scene, fromMs, timeline.totalMs);
  const cues = soundCues(scene, timeline).filter((c) => c.atMs >= fromMs);
  if (segs.length === 0 && cues.length === 0) return;
  const ac = audioContext();
  if (ac.state === "suspended") await ac.resume();
  const buffers = await Promise.all(segs.map((s) => decode(s.assetId)?.catch(() => null) ?? null));
  // The playhead moved while the files were decoded; start from where it is now.
  const st = useEditor.getState();
  if (!st.playing) return;
  const lag = st.playhead - fromMs;
  const t0 = ac.currentTime;
  // Ducking: the same gain ramps as the export.
  const voiceId = scene.audio.find((t) => t.kind === "voiceover")?.id;
  const vi = segs.findIndex((s) => s.trackId === voiceId);
  const voiceBuf = vi >= 0 ? buffers[vi] : null;
  const speech = voiceBuf && segs.some((s) => s.duckDb !== undefined) ? speechInOutput(segs[vi]!, speechCache(segs[vi]!.assetId, voiceBuf)) : [];
  segs.forEach((seg, i) => {
    const buffer = buffers[i];
    if (!buffer) return;
    const node = ac.createBufferSource();
    node.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = 10 ** (seg.gainDb / 20);
    if (seg.duckDb !== undefined) duck(gain.gain, 10 ** (seg.gainDb / 20), seg.duckDb, speech, t0 - lag / 1000);
    node.connect(gain).connect(ac.destination);
    const at = seg.atMs - lag;
    const skip = Math.max(0, -at);
    if (seg.toMs - seg.fromMs - skip <= 0) return;
    node.start(t0 + Math.max(0, at) / 1000, (seg.fromMs + skip) / 1000, (seg.toMs - seg.fromMs - skip) / 1000);
    playing.push(node);
  });
  // Sound effects of the actions.
  for (const c of cues) {
    const at = c.atMs - fromMs - lag;
    if (at < 0) continue;
    const node = ac.createBufferSource();
    node.buffer = soundBuffer(ac, c.sound);
    const gain = ac.createGain();
    gain.gain.value = 10 ** (c.gainDb / 20);
    node.connect(gain).connect(ac.destination);
    node.start(t0 + at / 1000);
    playing.push(node);
  }
}

/** Play the audio when the editor plays. A scene change while it plays starts the audio again. */
export function startAudioSync(): () => void {
  return useEditor.subscribe((s, prev) => {
    if (s.playing && (!prev.playing || s.scene.audio !== prev.scene.audio || s.assets !== prev.assets)) void start(s.playhead);
    else if (!s.playing && prev.playing) stop();
  });
}

// --- cues and script (docs/08) --------------------------------------------------

/** The voiceover track, if the scene has one. */
export const voiceover = () => useEditor.getState().scene.audio.find((t) => t.kind === "voiceover");

/** Start a step at a voiceover time. */
export function setCue(stepId: string, atMs: number, label = "Set cue"): boolean {
  const vo = voiceover();
  if (!vo) return false;
  return useEditor.getState().apply({ label, ops: [{ op: "step.update", id: stepId, set: { trigger: { kind: "cue", audioId: vo.id, atMs: Math.max(0, Math.round(atMs)) } } }] }).ok;
}

/**
 * Put a cue at the playhead for the next step that has not started (key M during play).
 * Returns the step ID, or null if no step is after the playhead.
 */
export function cueAtPlayhead(): string | null {
  const { timeline, playhead } = useEditor.getState();
  const next = timeline.steps.find((s) => s.startMs > playhead);
  if (!next || !setCue(next.id, playhead, "Set cue at playhead")) return null;
  return next.id;
}

/** Set the script from text: one line for each step, in order. Empty lines are skipped. */
export function setScriptText(text: string): void {
  const { scene, apply } = useEditor.getState();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Line IDs are given again in order (line-1, line-2, ...).
  const r = apply({ label: "Set script", ops: [{ op: "script.set", lines: lines.map((t, i) => ({ text: t, ...(scene.steps[i] ? { stepId: scene.steps[i]!.id } : {}) })) }] });
  if (!r.ok) throw new AudioError(r.error.message);
}

/** A script line with no ID: script.set gives the IDs again in order. */
function withoutId(l: ScriptLine): Omit<ScriptLine, "id"> {
  const out: Partial<ScriptLine> = { ...l };
  delete out.id;
  return out as Omit<ScriptLine, "id">;
}

/** Set the script line of one step. An empty text removes the line. */
export function setStepLine(stepId: string, text: string): void {
  const { scene, apply } = useEditor.getState();
  const has = scene.script.some((l) => l.stepId === stepId);
  const t = text.trim();
  const lines = has
    ? scene.script.flatMap((l) => (l.stepId !== stepId ? [withoutId(l)] : t ? [{ ...withoutId(l), text: t }] : []))
    : [...scene.script.map(withoutId), ...(t ? [{ text: t, stepId }] : [])];
  // Keep the script in step order.
  const order = new Map(scene.steps.map((s, i) => [s.id, i]));
  lines.sort((a, b) => (order.get(a.stepId ?? "") ?? 1e9) - (order.get(b.stepId ?? "") ?? 1e9));
  apply({ label: "Change script line", ops: [{ op: "script.set", lines }] });
}

/** Change each step to start at a voiceover cue, at its current start time. */
export function cueAllSteps(): void {
  const vo = voiceover();
  const { timeline, apply } = useEditor.getState();
  if (!vo) return;
  apply({ label: "Cue all steps", ops: timeline.steps.map((s) => ({ op: "step.update" as const, id: s.id, set: { trigger: { kind: "cue", audioId: vo.id, atMs: Math.round(s.startMs) } } })) });
}
