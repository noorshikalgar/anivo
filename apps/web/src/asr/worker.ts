/**
 * Speech recognition in the browser (docs/08 "Speech recognition"): Whisper with
 * Transformers.js, in a worker so the editor does not freeze. The audio stays
 * in the browser. Only the model files are downloaded, one time, then cached.
 */
import { env, pipeline } from "@huggingface/transformers";
// The ONNX Runtime files come from this site, not from a CDN.
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

export type AsrRequest = { audio: Float32Array; model: string; language?: string };
export type AsrMessage =
  | { type: "download"; loaded: number; total: number }
  | { type: "transcribing" }
  | { type: "done"; words: { text: string; startMs: number; endMs: number }[] }
  | { type: "error"; message: string };

env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };

const post = (m: AsrMessage) => (self as unknown as Worker).postMessage(m);
const files = new Map<string, { loaded: number; total: number }>();

self.onmessage = async (e: MessageEvent<AsrRequest>) => {
  try {
    // WASM with 8-bit weights works in all browsers and keeps the download small.
    // TODO(phase 5): WebGPU when an adapter is available; it needs fp16 or fp32 weights (2–4 times larger).
    const asr = await pipeline("automatic-speech-recognition", e.data.model, {
      device: "wasm",
      dtype: "q8",
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== "progress" || !p.file) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        post({ type: "download", loaded, total });
      },
    });
    post({ type: "transcribing" });
    const out = (await asr(e.data.audio, {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(e.data.language ? { language: e.data.language, task: "transcribe" } : {}),
    })) as { chunks?: { text: string; timestamp: [number, number | null] }[] };
    const words = (out.chunks ?? [])
      .map((c) => ({ text: c.text.trim(), startMs: Math.round(c.timestamp[0] * 1000), endMs: Math.round((c.timestamp[1] ?? c.timestamp[0]) * 1000) }))
      .filter((w) => w.text);
    post({ type: "done", words });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
