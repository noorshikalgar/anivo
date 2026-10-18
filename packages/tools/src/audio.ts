import { spawnSync } from "node:child_process";
import { ToolError } from "./files.js";

const MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", webm: "audio/webm" };

/** Media type from the file extension (docs/08: MP3, WAV, M4A, OGG). */
export function audioMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) throw new ToolError(`The audio file '${path}' has a type that Anivo does not read.`, "Use an MP3, WAV, M4A, OGG, or FLAC file.");
  return mime;
}

/** Length of an audio file in milliseconds, from ffprobe. */
export function probeDurationMs(path: string, ffprobe = process.env["ANIVO_FFPROBE"] ?? "ffprobe"): number {
  const r = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], { encoding: "utf8" });
  if (r.error) throw new ToolError("ffprobe was not found, so Anivo cannot read the audio length.", "Install FFmpeg, or set ANIVO_FFPROBE to the ffprobe path.");
  const seconds = Number(r.stdout.trim());
  if (r.status !== 0 || !Number.isFinite(seconds) || seconds <= 0) throw new ToolError(`The file '${path}' is not a valid audio file.`, "Use an MP3, WAV, M4A, OGG, or FLAC file.");
  if (seconds > 30 * 60) throw new ToolError("The audio is longer than 30 minutes.", "Use a shorter file (docs/08: maximum 30 minutes).");
  return Math.round(seconds * 1000);
}
