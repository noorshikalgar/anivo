/**
 * Sound effects on actions (FR-AUDIO-10). The sounds are synthesized, so Anivo
 * ships no sound files and no license. Pure and deterministic: the same name
 * gives the same samples.
 */
import type { Scene } from "@anivo/schema";
import { type Timeline, resolveTimeline } from "./timeline.js";

export const SOUNDS = ["pop", "click", "whoosh", "ding", "thud", "tick", "blip", "chime", "rise", "bubble", "success", "error", "keys", "ticks"] as const;
export type SoundName = (typeof SOUNDS)[number];
/** The sounds that the synthesizer makes: the names, and "key" (one key of "keys"). */
export type SynthName = SoundName | "key";
/** Sounds that repeat for the whole action: the sound of one repeat, and the time between two repeats. */
const REPEAT: Partial<Record<SoundName, { one: SynthName; everyMs: number }>> = { keys: { one: "key", everyMs: 65 }, ticks: { one: "tick", everyMs: 110 } };

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
export function synthSound(name: SynthName, rate: number): Float32Array {
  const raw = synthRaw(name, rate);
  let peak = 0;
  for (const v of raw) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < raw.length; i++) raw[i] = (raw[i]! / peak) * 0.8;
  return raw;
}

/** A sum of sine notes, each with a start, a length, and a volume. */
function notes(rate: number, list: { f: number; at: number; ms: number; v: number }[]): Float32Array {
  const total = Math.max(...list.map((x) => x.at + x.ms));
  const out = new Float32Array(Math.round((total / 1000) * rate));
  for (const nte of list) {
    const s0 = Math.round((nte.at / 1000) * rate);
    const n = Math.round((nte.ms / 1000) * rate);
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const t = i / rate;
      const e = i < 40 ? i / 40 : Math.exp((-4 * i) / n);
      out[s0 + i]! += (Math.sin(2 * Math.PI * nte.f * t) * 0.7 + Math.sin(2 * Math.PI * nte.f * 2 * t) * 0.2) * e * nte.v;
    }
  }
  return out;
}

function synthRaw(name: SynthName, rate: number): Float32Array {
  const len = (ms: number) => Math.round((ms / 1000) * rate);
  const env = (i: number, n: number, attack: number) => (i < attack ? i / attack : Math.exp((-5 * (i - attack)) / (n - attack)));
  if (name === "tick" || name === "key") {
    // tick: a short high wood tick. key: a soft typewriter key.
    const n = len(name === "tick" ? 25 : 35);
    const out = new Float32Array(n);
    const r = noise(name === "tick" ? 21 : 33);
    const f = name === "tick" ? 3200 : 1800;
    for (let i = 0; i < n; i++) out[i] = (Math.sin((2 * Math.PI * f * i) / rate) * 0.5 + r() * (name === "key" ? 0.6 : 0.25)) * env(i, n, 1) * (name === "key" ? 0.35 : 0.5);
    return out;
  }
  if (name === "blip") {
    const n = len(90);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.sign(Math.sin((2 * Math.PI * 880 * i) / rate)) * 0.15 * env(i, n, len(2)) + Math.sin((2 * Math.PI * 880 * i) / rate) * 0.4 * env(i, n, len(2));
    return out;
  }
  if (name === "chime") return notes(rate, [{ f: 1046.5, at: 0, ms: 600, v: 0.5 }, { f: 1568, at: 90, ms: 700, v: 0.45 }]);
  if (name === "success") return notes(rate, [{ f: 784, at: 0, ms: 220, v: 0.45 }, { f: 988, at: 90, ms: 240, v: 0.45 }, { f: 1175, at: 180, ms: 450, v: 0.5 }]);
  if (name === "error") {
    const n = len(320);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const gate = i < len(130) || i > len(170) ? 1 : 0;
      out[i] = Math.sign(Math.sin((2 * Math.PI * 180 * i) / rate)) * 0.35 * gate * env(i, n, len(3));
    }
    return out;
  }
  if (name === "bubble") {
    const n = len(140);
    const out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = 400 + 900 * (i / n) ** 2;
      phase += (2 * Math.PI * f) / rate;
      out[i] = Math.sin(phase) * env(i, n, len(4)) * 0.6;
    }
    return out;
  }
  if (name === "rise") {
    // A whoosh that goes up: noise with an opening filter, and a rising tone.
    const n = len(500);
    const out = new Float32Array(n);
    const r = noise(17);
    let lp = 0;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      lp += (0.01 + 0.3 * p) * (r() - lp);
      phase += (2 * Math.PI * (300 + 900 * p)) / rate;
      const shape = Math.sin(Math.PI * Math.min(1, p * 1.1));
      out[i] = (lp * 1.4 + Math.sin(phase) * 0.12) * shape;
    }
    return out;
  }
  if (name === "keys" || name === "ticks") return synthRaw(name === "keys" ? "key" : "tick", rate);
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
  sound: SynthName;
  gainDb: number;
}

/** The sounds of the actions, in time order. */
export function soundCues(scene: Scene, timeline: Timeline = resolveTimeline(scene)): SoundCue[] {
  const out: SoundCue[] = [];
  for (const ts of timeline.steps) {
    const step = scene.steps[ts.index]!;
    for (const a of step.actions) {
      if (!a.sound) continue;
      const gainDb = a.soundGainDb ?? -6;
      const rep = REPEAT[a.sound];
      if (rep) {
        // A repeating sound runs for the whole action (all its targets).
        const parts = ts.actions.filter((x) => x.action.id === a.id);
        const from = parts.length ? Math.min(...parts.map((p) => p.startMs)) : ts.startMs + a.delayMs;
        const to = parts.length ? Math.max(...parts.map((p) => p.endMs)) : from;
        for (let t = from, k = 0; t < to && k < 400; t += rep.everyMs, k++) out.push({ atMs: Math.round(t), sound: rep.one, gainDb: gainDb - 4 });
        continue;
      }
      out.push({ atMs: ts.startMs + a.delayMs, sound: a.sound, gainDb });
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
