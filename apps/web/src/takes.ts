/**
 * Record the voiceover step by step (docs/08 "Record step by step").
 *
 * Select a step and record a take: the step plays while you speak, then holds.
 * Stop puts the take into the voiceover at the place of the step (one undo
 * step) and goes to the next step. A new take of a step replaces the old one,
 * and the later steps move. When a take is shorter than the animation of the
 * step, silence fills the rest, so the next step never starts too early.
 */
import { wavBytes } from "@anivo/engine";
import { OperationBus, planFit, planTake, speechIntervals, spliceTake, trimTake, voiceParts } from "@anivo/ops";
import { AudioError, addAudio, decode } from "./audio.js";
import { notify } from "./notify.js";
import { useEditor } from "./store.js";

export interface TakesState {
  phase: "ready" | "countdown" | "recording" | "saving" | "playing";
  /** Index of the selected step. */
  stepIndex: number;
  countdown: number;
  elapsedMs: number;
}

const RATE = 48000;
/** Silence kept before and after the speech of a take. */
const PAD_MS = 250;

let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
let raf = 0;
let timer = 0;

const setTakes = (t: Partial<TakesState> | null) =>
  useEditor.setState((s) => ({ takes: t === null ? null : { ...(s.takes ?? { phase: "ready", stepIndex: 0, countdown: 0, elapsedMs: 0 }), ...t } }));

/** Open the step-by-step mode at the first step without a voice cue. */
export function openTakes(): void {
  const st = useEditor.getState();
  if (st.scene.steps.length === 0) throw new AudioError("The scene has no steps. Add steps before you record a voiceover.");
  if (st.recording) return;
  const vo = st.scene.audio.find((t) => t.kind === "voiceover");
  const first = st.scene.steps.findIndex((s) => !(s.trigger.kind === "cue" && s.trigger.audioId === vo?.id));
  goToTake(first < 0 ? 0 : first);
}

/** Select a step. The canvas shows its end state. */
export function goToTake(i: number): void {
  const st = useEditor.getState();
  const step = st.scene.steps[i];
  if (!step) return;
  stopPreview();
  st.selectStep(step.id);
  setTakes({ phase: "ready", stepIndex: i, elapsedMs: 0 });
}

export function closeTakes(): void {
  cancelTake();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  setTakes(null);
}

/** The playhead plays the selected step from its start, then holds at its end. */
function loop(): void {
  const st = useEditor.getState();
  const t = st.takes;
  if (!t || t.phase !== "recording") return;
  const elapsedMs = performance.now() - startedAt;
  const step = st.timeline.steps[t.stepIndex];
  if (step) useEditor.setState({ playhead: Math.min(step.holdEndMs, step.startMs + elapsedMs) });
  setTakes({ elapsedMs });
  raf = requestAnimationFrame(loop);
}

/** Record a take of the selected step, after a countdown. */
export async function recordTake(): Promise<void> {
  const st = useEditor.getState();
  const t = st.takes;
  if (!t || (t.phase !== "ready" && t.phase !== "playing")) return;
  stopPreview();
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new AudioError("This browser cannot record audio. Use Chrome, Edge, or Firefox, or import a voiceover file.");
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new AudioError("Anivo has no permission to use the microphone. Allow the microphone in the browser settings, then try again.");
    }
  }
  st.pause();
  const step = st.timeline.steps[t.stepIndex];
  useEditor.setState({ playhead: step?.startMs ?? 0 });
  setTakes({ phase: "countdown", countdown: 3, elapsedMs: 0 });
  await new Promise<void>((resolve) => {
    let n = 3;
    timer = window.setInterval(() => {
      n--;
      if (useEditor.getState().takes?.phase !== "countdown" || n <= 0) {
        clearInterval(timer);
        resolve();
      } else setTakes({ countdown: n });
    }, 1000);
  });
  if (useEditor.getState().takes?.phase !== "countdown" || !stream) return; // cancelled
  chunks = [];
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  recorder.start(250);
  startedAt = performance.now();
  setTakes({ phase: "recording", elapsedMs: 0 });
  raf = requestAnimationFrame(loop);
}

/** Stop the countdown or the record. Nothing changes in the scene. */
export function cancelTake(): void {
  clearInterval(timer);
  cancelAnimationFrame(raf);
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = null;
    recorder.stop();
  }
  recorder = null;
  stopPreview();
  if (useEditor.getState().takes) setTakes({ phase: "ready", elapsedMs: 0 });
}

/** Mono samples at RATE. */
function mono(b: AudioBuffer): Float32Array {
  const src = b.getChannelData(0);
  const step = b.sampleRate / RATE;
  const out = new Float32Array(Math.floor(src.length / step));
  for (let i = 0; i < out.length; i++) out[i] = src[Math.min(src.length - 1, Math.floor(i * step))]!;
  return out;
}

/** Stop the record and put the take into the voiceover. Then go to the next step. */
export async function saveTake(): Promise<void> {
  const st = useEditor.getState();
  const t = st.takes;
  if (!t || t.phase !== "recording" || !recorder) return cancelTake();
  setTakes({ phase: "saving" });
  cancelAnimationFrame(raf);
  const r = recorder;
  recorder = null;
  const done = new Promise<void>((resolve) => (r.onstop = () => resolve()));
  r.stop();
  await done;
  try {
    const type = r.mimeType.split(";")[0] || "audio/webm";
    const ac = new AudioContext();
    let take: Float32Array;
    try {
      take = mono(await ac.decodeAudioData(await new Blob(chunks, { type }).arrayBuffer()));
    } finally {
      void ac.close();
    }
    take = trimTake(take, RATE, PAD_MS);
    const takeMs = Math.round((take.length / RATE) * 1000);
    const scene = useEditor.getState().scene;
    const step = scene.steps[t.stepIndex]!;
    const plan = planTake(scene, step.id, takeMs);
    const vo = scene.audio.find((a) => a.kind === "voiceover");
    const old = vo ? await decode(vo.assetId) : null;
    if (vo && !old) throw new AudioError("The voiceover audio is missing. Import the voiceover again.");
    const out = spliceTake(old ? mono(old) : new Float32Array(0), take, RATE, plan);
    await addAudio(wavBytes(out, RATE), "voiceover-takes.wav", "audio/wav", "voiceover", () => plan.ops);
    const next = Math.min(t.stepIndex + 1, scene.steps.length - 1);
    goToTake(next);
  } catch (err) {
    setTakes({ phase: "ready", elapsedMs: 0 });
    throw err;
  }
}

/** Play the selected step with its voice, from its start to the start of the next step. */
export function previewTake(): void {
  const st = useEditor.getState();
  const t = st.takes;
  if (!t || t.phase !== "ready") return;
  const step = st.timeline.steps[t.stepIndex];
  if (!step) return;
  const end = st.timeline.steps[t.stepIndex + 1]?.startMs ?? st.timeline.totalMs;
  st.pause();
  useEditor.setState({ playhead: step.startMs });
  setTakes({ phase: "playing" });
  st.play();
  const watch = () => {
    const s = useEditor.getState();
    if (s.takes?.phase !== "playing") return;
    if (!s.playing || s.playhead >= end) {
      s.pause();
      useEditor.setState({ playhead: Math.min(end, step.holdEndMs) });
      setTakes({ phase: "ready" });
      return;
    }
    raf = requestAnimationFrame(watch);
  };
  raf = requestAnimationFrame(watch);
}

function stopPreview(): void {
  const st = useEditor.getState();
  if (st.takes?.phase === "playing") {
    cancelAnimationFrame(raf);
    st.pause();
    setTakes({ phase: "ready" });
  }
}

/**
 * Make the animation of the selected step faster, so that it ends with the
 * speech of its take. The silence after the take goes away. One undo step.
 */
export async function fitAnimationToVoice(): Promise<void> {
  const st = useEditor.getState();
  const t = st.takes;
  if (!t || t.phase !== "ready") return;
  const scene = st.scene;
  const step = scene.steps[t.stepIndex]!;
  const part = voiceParts(scene).find((p) => p.stepId === step.id);
  const vo = scene.audio.find((a) => a.kind === "voiceover");
  if (!part || !vo) throw new AudioError("This step has no voice. Record a take first.");
  const buffer = await decode(vo.assetId);
  if (!buffer) throw new AudioError("The voiceover audio is missing. Import the voiceover again.");
  const old = mono(buffer);
  const at = (ms: number) => Math.max(0, Math.round(((ms - vo.startMs + vo.trimStartMs) / 1000) * RATE));
  const samplesOfPart = old.slice(at(part.fromMs), at(part.toMs));
  const speech = speechIntervals(samplesOfPart, RATE);
  const voiceMs = speech.length ? Math.min(part.toMs - part.fromMs, Math.round(speech.at(-1)!.toMs + PAD_MS)) : part.toMs - part.fromMs;
  const fit = planFit(scene, step.id, voiceMs);
  if (fit.ops.length === 0) {
    notify("The animation of this step is not longer than its voice.", "info");
    return;
  }
  const bus = new OperationBus(scene);
  const r = bus.apply({ ops: fit.ops });
  if (!r.ok) throw new AudioError(r.error.message);
  const take = samplesOfPart.slice(0, Math.round((voiceMs / 1000) * RATE));
  const plan = planTake(bus.scene, step.id, voiceMs);
  await addAudio(wavBytes(spliceTake(old, take, RATE, plan), RATE), "voiceover-takes.wav", "audio/wav", "voiceover", () => [...fit.ops, ...plan.ops]);
  goToTake(t.stepIndex);
}
