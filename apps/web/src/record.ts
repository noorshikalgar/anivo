/**
 * Record a voiceover in the app (docs/08 "Record in the app", FR-AUDIO-07).
 *
 * 1. Ask for the microphone. 2. Count down 3 seconds. 3. Record. The scene shows
 * the base state. Each press of M (or the right arrow) starts the next step and
 * records the time as its cue. A step plays to its end and holds there until the
 * next press, like a live presentation. 4. Stop: the record becomes the voiceover
 * and the steps get their cues, in one undo step.
 */
import { addAudio, AudioError } from "./audio.js";
import { useEditor } from "./store.js";

export interface RecordingState {
  phase: "countdown" | "recording" | "saving";
  /** Seconds left in the countdown. */
  countdown: number;
  elapsedMs: number;
  /** Index of the step that shows now; -1 is the base state. */
  stepIndex: number;
}

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let marks: { stepId: string; atMs: number }[] = [];
let startedAt = 0;
let raf = 0;
let countdownTimer = 0;

const setRec = (r: Partial<RecordingState> | null) =>
  useEditor.setState((s) => ({ recording: r === null ? null : { ...(s.recording ?? { phase: "countdown", countdown: 3, elapsedMs: 0, stepIndex: -1 }), ...r } }));

/** A media type that this browser can record. */
function recordMime(): string {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

/** Show the step at `i`: the playhead runs from its start to its end, then holds. */
function loop(): void {
  const st = useEditor.getState();
  const rec = st.recording;
  if (!rec || rec.phase !== "recording") return;
  const elapsedMs = performance.now() - startedAt;
  const step = st.timeline.steps[rec.stepIndex];
  let playhead = 0;
  if (step) {
    const mark = marks[marks.length - 1]!;
    playhead = Math.min(step.endMs, step.startMs + (elapsedMs - mark.atMs));
  }
  useEditor.setState({ playhead, recording: { ...rec, elapsedMs } });
  raf = requestAnimationFrame(loop);
}

export async function startRecording(): Promise<void> {
  const st = useEditor.getState();
  if (st.recording) return;
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new AudioError("This browser cannot record audio. Use Chrome, Edge, or Firefox, or import a voiceover file.");
  if (st.scene.steps.length === 0) throw new AudioError("The scene has no steps. Add steps before you record a voiceover.");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new AudioError("Anivo has no permission to use the microphone. Allow the microphone in the browser settings, then try again.");
  }
  st.pause();
  st.selectStep(null);
  marks = [];
  chunks = [];
  setRec({ phase: "countdown", countdown: 3, elapsedMs: 0, stepIndex: -1 });
  await new Promise<void>((resolve) => {
    let n = 3;
    countdownTimer = window.setInterval(() => {
      n--;
      if (!useEditor.getState().recording) {
        clearInterval(countdownTimer);
        resolve();
      } else if (n <= 0) {
        clearInterval(countdownTimer);
        resolve();
      } else setRec({ countdown: n });
    }, 1000);
  });
  if (!useEditor.getState().recording) return; // cancelled in the countdown
  const mime = recordMime();
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  recorder.start(250);
  startedAt = performance.now();
  useEditor.setState({ playhead: 0 });
  setRec({ phase: "recording", elapsedMs: 0, stepIndex: -1 });
  raf = requestAnimationFrame(loop);
}

/** Start the next step now and record its cue (M or the right arrow). */
export function nextStep(): void {
  const st = useEditor.getState();
  const rec = st.recording;
  if (!rec || rec.phase !== "recording") return;
  const i = rec.stepIndex + 1;
  const step = st.scene.steps[i];
  if (!step) return;
  marks.push({ stepId: step.id, atMs: Math.round(performance.now() - startedAt) });
  setRec({ stepIndex: i });
}

function release(): void {
  cancelAnimationFrame(raf);
  clearInterval(countdownTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

/** Cancel the record. Nothing changes in the scene. */
export function cancelRecording(): void {
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = null;
    recorder.stop();
  }
  recorder = null;
  release();
  setRec(null);
  useEditor.setState({ playhead: 0 });
}

/** Stop the record and save it as the voiceover, with a cue for each marked step. */
export async function stopRecording(): Promise<void> {
  const rec = useEditor.getState().recording;
  if (!rec) return;
  if (rec.phase === "countdown" || !recorder) return cancelRecording();
  setRec({ phase: "saving" });
  cancelAnimationFrame(raf);
  const r = recorder;
  recorder = null;
  const done = new Promise<void>((resolve) => (r.onstop = () => resolve()));
  r.stop();
  await done;
  release();
  try {
    const type = r.mimeType.split(";")[0] || "audio/webm";
    const bytes = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    // The voiceover and the cues are one transaction, so one undo removes the record.
    await addAudio(bytes, `Recording.${ext}`, type, "voiceover", (trackId) =>
      marks.map((m) => ({ op: "step.update", id: m.stepId, set: { trigger: { kind: "cue", audioId: trackId, atMs: m.atMs } } })),
    );
  } finally {
    setRec(null);
    useEditor.setState({ playhead: 0 });
  }
}
