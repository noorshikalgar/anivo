/**
 * Text to speech (FR-AUDIO-08): make the voiceover from the script with the
 * user's own key. Each line is spoken alone, so Anivo knows where each line
 * starts: the steps get exact cues, with no alignment.
 * Provider: an OpenAI-compatible `/audio/speech` endpoint (OpenAI, or a local
 * server with the same API, for example a Piper or Kokoro server).
 */
import { wavBytes } from "@anivo/engine";
import { addAudio } from "./audio.js";
import { useEditor } from "./store.js";

export interface TtsSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
}

export const TTS_DEFAULTS: TtsSettings = { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini-tts", voice: "alloy" };

const RATE = 48000;
/** Silence before the first line and between lines. */
const LEAD_MS = 400;
const GAP_MS = 600;

/** Speak each linked script line, join them, and set the result as the voiceover with a cue for each step. */
export async function generateVoiceover(s: TtsSettings, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<number> {
  const { scene } = useEditor.getState();
  const order = new Map(scene.steps.map((st, i) => [st.id, i]));
  const lines = scene.script.filter((l) => l.stepId && l.text.trim()).sort((a, b) => order.get(a.stepId!)! - order.get(b.stepId!)!);
  if (lines.length === 0) throw new Error("The script has no lines that link to steps. Write the script first (Audio › Edit script).");
  const ac = new AudioContext();
  const clips: AudioBuffer[] = [];
  try {
    for (const [i, line] of lines.entries()) {
      const res = await fetch(`${s.baseUrl.replace(/\/+$/, "")}/audio/speech`, {
        method: "POST",
        signal: signal ?? null,
        headers: { "content-type": "application/json", ...(s.apiKey ? { authorization: `Bearer ${s.apiKey}` } : {}) },
        body: JSON.stringify({ model: s.model, voice: s.voice, input: line.text, response_format: "wav" }),
      });
      if (!res.ok) throw new Error(`The speech service answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      clips.push(await ac.decodeAudioData(await res.arrayBuffer()));
      onProgress?.(i + 1, lines.length);
    }
  } finally {
    void ac.close();
  }
  // Join the clips (mono, 48 kHz). Each line starts at a known time.
  const starts: number[] = [];
  let at = Math.round((LEAD_MS / 1000) * RATE);
  for (const c of clips) {
    starts.push(at);
    at += Math.round(c.duration * RATE) + Math.round((GAP_MS / 1000) * RATE);
  }
  const out = new Float32Array(at);
  clips.forEach((c, i) => {
    const src = c.getChannelData(0);
    const step = c.sampleRate / RATE;
    const n = Math.round(c.duration * RATE);
    for (let k = 0; k < n; k++) out[starts[i]! + k] = src[Math.min(src.length - 1, Math.floor(k * step))]!;
  });
  const bytes = wavBytes(out, RATE);
  // A new voiceover keeps the start time of the old one.
  const offset = useEditor.getState().scene.audio.find((t) => t.kind === "voiceover")?.startMs ?? 0;
  await addAudio(bytes, "voiceover-tts.wav", "audio/wav", "voiceover", (trackId) =>
    lines.map((l, i) => ({ op: "step.update" as const, id: l.stepId!, set: { trigger: { kind: "cue", audioId: trackId, atMs: offset + Math.round((starts[i]! / RATE) * 1000) } } })),
  );
  return lines.length;
}

const KEY = "ttsSettings";
export async function loadTtsSettings(): Promise<TtsSettings> {
  const { idbGet } = await import("./idb.js");
  return (await idbGet<TtsSettings>(KEY).catch(() => undefined)) ?? TTS_DEFAULTS;
}
export async function saveTtsSettings(s: TtsSettings): Promise<void> {
  const { idbSet } = await import("./idb.js");
  await idbSet(KEY, s);
}
