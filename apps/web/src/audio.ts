/**
 * Audio in the editor (docs/08): import, waveform peaks, and playback in sync with the playhead.
 * The bytes are in the store (`assets`); the scene has only the references.
 */
import { assetId } from "@anivo/fileio";
import { type AudioTrack, audioSegments } from "@anivo/schema";
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
export async function addAudio(bytes: Uint8Array, name: string, type: string, kind: AudioTrack["kind"]): Promise<string> {
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
  const r = st.apply({
    label: kind === "voiceover" ? "Add voiceover" : "Add audio",
    ops: [
      ...(old ? [{ op: "audio.remove" as const, id: old.id }] : []),
      { op: "asset.add", asset: { id, mime, bytes: bytes.length, name } },
      { op: "audio.add", track: { ...(old ? { id: old.id } : {}), kind, assetId: id, durationMs, startMs: old?.startMs ?? 0 } },
    ],
  });
  if (!r.ok) throw new AudioError(r.error.message);
  return r.created[0] ?? old?.id ?? "";
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

function stop(): void {
  for (const n of playing) n.stop();
  playing = [];
}

async function start(fromMs: number): Promise<void> {
  stop();
  const { scene, timeline } = useEditor.getState();
  const segs = audioSegments(scene, fromMs, timeline.totalMs);
  if (segs.length === 0) return;
  const ac = audioContext();
  if (ac.state === "suspended") await ac.resume();
  const buffers = await Promise.all(segs.map((s) => decode(s.assetId)?.catch(() => null) ?? null));
  // The playhead moved while the files were decoded; start from where it is now.
  const st = useEditor.getState();
  if (!st.playing) return;
  const lag = st.playhead - fromMs;
  const t0 = ac.currentTime;
  segs.forEach((seg, i) => {
    const buffer = buffers[i];
    if (!buffer) return;
    const node = ac.createBufferSource();
    node.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = 10 ** (seg.gainDb / 20);
    node.connect(gain).connect(ac.destination);
    const at = seg.atMs - lag;
    const skip = Math.max(0, -at);
    if (seg.toMs - seg.fromMs - skip <= 0) return;
    node.start(t0 + Math.max(0, at) / 1000, (seg.fromMs + skip) / 1000, (seg.toMs - seg.fromMs - skip) / 1000);
    playing.push(node);
  });
}

/** Play the audio when the editor plays. A scene change while it plays starts the audio again. */
export function startAudioSync(): () => void {
  return useEditor.subscribe((s, prev) => {
    if (s.playing && (!prev.playing || s.scene.audio !== prev.scene.audio || s.assets !== prev.assets)) void start(s.playhead);
    else if (!s.playing && prev.playing) stop();
  });
}
