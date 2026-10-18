import { type Onset, speechOnsets } from "@anivo/ops";
import { useEditor } from "../store.js";
import type { AsrMessage, AsrRequest } from "./worker.js";

export interface AsrModel {
  id: string;
  label: string;
  /** Approximate download size in MB. */
  sizeMb: number;
}

/** Whisper models with word times (docs/08: small or base model). */
export const ASR_MODELS: AsrModel[] = [
  { id: "Xenova/whisper-base.en", label: "Whisper base (English)", sizeMb: 80 },
  { id: "Xenova/whisper-base", label: "Whisper base (many languages)", sizeMb: 80 },
  { id: "Xenova/whisper-tiny.en", label: "Whisper tiny (English, fast, less accurate)", sizeMb: 40 },
];

const SAMPLE_RATE = 16_000;

/** Speech onsets of an audio asset, for the alignment (cues snap to them). */
export async function voiceOnsets(assetId: string): Promise<Onset[]> {
  return speechOnsets(await audio16k(assetId), SAMPLE_RATE);
}

/** Decode an asset to 16 kHz mono, the input of Whisper. */
async function audio16k(assetId: string): Promise<Float32Array> {
  const bytes = useEditor.getState().assets.get(assetId);
  if (!bytes) throw new Error("The voiceover file is missing. Add the voiceover again.");
  const decoded = await new AudioContext().decodeAudioData(bytes.slice().buffer);
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: Math.ceil(decoded.duration * SAMPLE_RATE), sampleRate: SAMPLE_RATE });
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start();
  return (await ctx.startRendering()).getChannelData(0);
}

/** Transcribe a voiceover asset in the browser. Words have times in the source file. */
export async function transcribeInBrowser(
  assetId: string,
  opts: { model: string; language?: string; onStatus?: (m: AsrMessage) => void; signal?: AbortSignal },
): Promise<{ text: string; startMs: number; endMs: number }[]> {
  const audio = await audio16k(assetId);
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise((resolve, reject) => {
      opts.signal?.addEventListener("abort", () => reject(new Error("The transcription was cancelled.")));
      worker.onerror = (e) => reject(new Error(e.message || "The speech recognition did not start."));
      worker.onmessage = (e: MessageEvent<AsrMessage>) => {
        const m = e.data;
        opts.onStatus?.(m);
        if (m.type === "done") resolve(m.words);
        else if (m.type === "error") reject(new Error(`The speech recognition failed: ${m.message}`));
      };
      worker.postMessage({ audio, model: opts.model, ...(opts.language ? { language: opts.language } : {}) } satisfies AsrRequest, [audio.buffer]);
    });
  } finally {
    worker.terminate();
  }
}
