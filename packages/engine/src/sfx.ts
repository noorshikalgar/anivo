/**
 * Sound effects on actions (FR-AUDIO-10). The sounds are synthesized, so Anivo
 * ships no sound files and no license. Pure and deterministic: the same name
 * gives the same samples.
 */
import type { Scene } from "@anivo/schema";
import { type Timeline, resolveTimeline } from "./timeline.js";

export const SOUNDS = ["pop", "click", "whoosh", "ding", "thud"] as const;
export type SoundName = (typeof SOUNDS)[number];

/** A seeded noise source (mulberry32). */
function noise(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Mono samples of a sound at a sample rate. The peak is 0.8. */
export function synthSound(name: SoundName, rate: number): Float32Array {
  const raw = synthRaw(name, rate);
  let peak = 0;
  for (const v of raw) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < raw.length; i++) raw[i] = (raw[i]! / peak) * 0.8;
  return raw;
}

function synthRaw(name: SoundName, rate: number): Float32Array {
  const len = (ms: number) => Math.round((ms / 1000) * rate);
  const env = (i: number, n: number, attack: number) => (i < attack ? i / attack : Math.exp((-5 * (i - attack)) / (n - attack)));
  if (name === "pop") {
    const n = len(120);
    const out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = 900 - 650 * (i / n);
      phase += (2 * Math.PI * f) / rate;
      out[i] = Math.sin(phase) * env(i, n, len(3)) * 0.6;
    }
    return out;
  }
  if (name === "click") {
    const n = len(30);
    const out = new Float32Array(n);
    const r = noise(7);
    for (let i = 0; i < n; i++) out[i] = (r() * 0.6 + Math.sin((2 * Math.PI * 2400 * i) / rate) * 0.4) * env(i, n, 1) * 0.7;
    return out;
  }
  if (name === "whoosh") {
    const n = len(450);
    const out = new Float32Array(n);
    const r = noise(11);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      // A low-pass filter that opens and closes, on noise: a rush of air.
      const cut = 0.02 + 0.25 * Math.sin(Math.PI * p);
      lp += cut * (r() - lp);
      out[i] = lp * Math.sin(Math.PI * p) * 1.6;
    }
    return out;
  }
  if (name === "ding") {
    const n = len(700);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      out[i] = (Math.sin(2 * Math.PI * 1320 * t) * 0.6 + Math.sin(2 * Math.PI * 2640 * t) * 0.25 + Math.sin(2 * Math.PI * 3960 * t) * 0.1) * env(i, n, len(2)) * 0.5;
    }
    return out;
  }
  // thud
  const n = len(220);
  const out = new Float32Array(n);
  const r = noise(3);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = 140 - 90 * (i / n);
    phase += (2 * Math.PI * f) / rate;
    out[i] = (Math.sin(phase) * 0.9 + r() * 0.15 * Math.exp(-i / len(10))) * env(i, n, len(2)) * 0.8;
  }
  return out;
}

/** One sound of an action: when it starts (scene time) and its volume. */
export interface SoundCue {
  atMs: number;
  sound: SoundName;
  gainDb: number;
}

/** The sounds of the actions, in time order. */
export function soundCues(scene: Scene, timeline: Timeline = resolveTimeline(scene)): SoundCue[] {
  const out: SoundCue[] = [];
  for (const ts of timeline.steps) {
    const step = scene.steps[ts.index]!;
    for (const a of step.actions) {
      if (!a.sound) continue;
      out.push({ atMs: ts.startMs + a.delayMs, sound: a.sound, gainDb: a.soundGainDb ?? -6 });
    }
  }
  return out.sort((x, y) => x.atMs - y.atMs);
}

/** WAV bytes (16-bit mono) of samples, for tools that read files. */
export function wavBytes(samples: Float32Array, rate: number): Uint8Array {
  const b = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  b.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVEfmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, rate, true);
  b.setUint32(28, rate * 2, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  str(36, "data");
  b.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true));
  return new Uint8Array(b.buffer);
}
