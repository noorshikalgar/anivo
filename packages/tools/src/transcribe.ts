/**
 * Speech recognition for the CLI and the MCP server (docs/08 "Speech recognition"):
 * whisper.cpp runs locally. The voiceover never leaves the computer.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscriptJson } from "@anivo/ops";
import { ToolError } from "./files.js";

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** Read transcript words from JSON (see `parseTranscript` in @anivo/ops). Errors are tool errors. */
export function parseTranscript(json: unknown): TranscriptWord[] {
  try {
    return parseTranscriptJson(json);
  } catch (err) {
    const [message, hint] = (err instanceof Error ? err.message : String(err)).split(" | ");
    throw new ToolError(message!, hint);
  }
}

/** Transcribe audio bytes with whisper.cpp. Returns words with times in the source file. */
export function transcribe(bytes: Uint8Array, opts: { model?: string; language?: string } = {}): TranscriptWord[] {
  const whisper = process.env["ANIVO_WHISPER"] ?? "whisper-cli";
  const ffmpeg = process.env["ANIVO_FFMPEG"] ?? "ffmpeg";
  const model = opts.model ?? process.env["ANIVO_WHISPER_MODEL"];
  if (!model || !existsSync(model)) {
    throw new ToolError("Anivo needs a whisper.cpp model file to transcribe.", "Download a model (for example ggml-base.en.bin) and give it with --model, or set ANIVO_WHISPER_MODEL.");
  }
  const dir = mkdtempSync(join(tmpdir(), "anivo-whisper-"));
  try {
    const src = join(dir, "in");
    const wav = join(dir, "voice.wav");
    writeFileSync(src, bytes);
    // whisper.cpp reads 16 kHz mono WAV.
    const conv = spawnSync(ffmpeg, ["-v", "error", "-y", "-i", src, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
    if (conv.error) throw new ToolError("FFmpeg was not found.", "Install FFmpeg, or set ANIVO_FFMPEG to the ffmpeg path.");
    if (conv.status !== 0) throw new ToolError("FFmpeg could not read the voiceover.", conv.stderr.toString().trim().split("\n").pop());
    const r = spawnSync(whisper, ["-m", model, "-f", wav, "-ml", "1", "-sow", "-oj", "-of", join(dir, "out"), "-np", ...(opts.language ? ["-l", opts.language] : [])], { maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw new ToolError("whisper.cpp was not found.", "Install whisper.cpp (the whisper-cli program), or set ANIVO_WHISPER to its path.");
    if (r.status !== 0) throw new ToolError("whisper.cpp did not transcribe the voiceover.", r.stderr.toString().trim().split("\n").pop());
    return parseTranscript(JSON.parse(readFileSync(join(dir, "out.json"), "utf8")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
