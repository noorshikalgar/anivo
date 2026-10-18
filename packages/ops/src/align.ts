/**
 * Alignment of script lines to a transcript with word times (docs/08 "Alignment").
 * Pure and deterministic.
 */

export interface AlignWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface LineAlignment {
  /** Index of the script line. */
  line: number;
  /** Start of the first matched word, in transcript time. Null if the line is unmatched. */
  startMs: number | null;
  /** End of the last matched word, in transcript time. */
  endMs: number | null;
  /** Matched words / words of the line (0..1). */
  matched: number;
  unmatched: boolean;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Words of a number from 0 to 999 999 ("42" → "forty two"). Larger numbers stay as digits. */
export function numberWords(n: number): string[] {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return [String(n)];
  if (n < 20) return [ONES[n]!];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)]!, ONES[n % 10]!] : [TENS[n / 10]!];
  if (n < 1000) return [ONES[Math.floor(n / 100)]!, "hundred", ...(n % 100 ? numberWords(n % 100) : [])];
  return [...numberWords(Math.floor(n / 1000)), "thousand", ...(n % 1000 ? numberWords(n % 1000) : [])];
}

/** Lower case, no punctuation, numbers as words. "HTTP/2, 3 pods!" → ["http", "two", "three", "pods"]. */
export function normalizeWords(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().replace(/[’']/g, "").split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    // Split digits from letters: "http2" → "http", "2".
    for (const part of raw.match(/\p{N}+|\p{L}+/gu) ?? []) out.push(...(/^\d+$/.test(part) ? numberWords(Number(part)) : [part]));
  }
  return out;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > Math.max(n, m) / 2) return 0;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[m]! / Math.max(n, m);
}

const MATCH = 3;
const FUZZY = 1;
const MISMATCH = -2;
const GAP = -1;

/**
 * Align script lines to transcript words: a global alignment of the word
 * sequences (Needleman–Wunsch) with a fuzzy word match.
 */
/**
 * Times (ms) where speech starts after a pause of `minSilenceMs` or more.
 * Energy in 20 ms frames; the threshold follows the quiet level of the file.
 */
export interface Onset {
  /** Time in ms where speech starts. */
  atMs: number;
  /** Length of the pause before it. */
  pauseMs: number;
}

export function speechOnsets(samples: Float32Array, rate: number, minSilenceMs = 150): Onset[] {
  const frame = Math.max(1, Math.round(rate * 0.02));
  const n = Math.floor(samples.length / frame);
  if (n === 0) return [];
  const rms = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let k = f * frame; k < (f + 1) * frame; k++) sum += samples[k]! * samples[k]!;
    rms[f] = Math.sqrt(sum / frame);
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.1)]!;
  const peak = sorted[Math.floor(n * 0.98)]!;
  const threshold = Math.max(floor * 4, peak * 0.06, 1e-4);
  const out: Onset[] = [];
  let quiet = 10_000; // the start of the file counts as a long pause
  for (let f = 0; f < n; f++) {
    if (rms[f]! < threshold) quiet += 20;
    else {
      if (quiet >= minSilenceMs) out.push({ atMs: f * 20, pauseMs: quiet });
      quiet = 0;
    }
  }
  return out;
}

/**
 * Parts of the audio with speech (ms): energy in 20 ms frames, pauses shorter
 * than `joinMs` join, parts shorter than 150 ms are dropped. For music ducking.
 */
export function speechIntervals(samples: Float32Array, rate: number, joinMs = 400): { fromMs: number; toMs: number }[] {
  const onsets = speechOnsets(samples, rate, joinMs);
  if (onsets.length === 0) return [];
  // The end of each part: the last loud frame before the next onset.
  const frame = Math.max(1, Math.round(rate * 0.02));
  const n = Math.floor(samples.length / frame);
  const rms = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let k = f * frame; k < (f + 1) * frame; k++) sum += samples[k]! * samples[k]!;
    rms[f] = Math.sqrt(sum / frame);
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const threshold = Math.max(sorted[Math.floor(n * 0.1)]! * 4, sorted[Math.floor(n * 0.98)]! * 0.06, 1e-4);
  const out: { fromMs: number; toMs: number }[] = [];
  onsets.forEach((o, i) => {
    const limit = Math.floor((onsets[i + 1]?.atMs ?? n * 20) / 20);
    let last = Math.floor(o.atMs / 20);
    for (let f = last; f < limit && f < n; f++) if (rms[f]! >= threshold) last = f;
    const toMs = (last + 1) * 20;
    if (toMs - o.atMs >= 150) out.push({ fromMs: o.atMs, toMs });
  });
  return out;
}

export function alignScript(lines: string[], transcript: AlignWord[], opts: { onsets?: Onset[] } = {}): LineAlignment[] {
  const sw: { w: string; line: number }[] = [];
  lines.forEach((t, line) => normalizeWords(t).forEach((w) => sw.push({ w, line })));
  const tw: { w: string; word: AlignWord }[] = [];
  for (const word of transcript) for (const w of normalizeWords(word.text)) tw.push({ w, word });

  const n = sw.length;
  const m = tw.length;
  // Traceback: 0 diagonal, 1 up (script word skipped), 2 left (transcript word skipped).
  const trace = new Uint8Array((n + 1) * (m + 1));
  const kind = new Uint8Array((n + 1) * (m + 1)); // 1 for a match or fuzzy match on the diagonal
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) {
    prev[j] = j * GAP;
    trace[j] = 2;
  }
  const cache = new Map<string, number>();
  const sim = (a: string, b: string) => {
    const k = `${a}\u0000${b}`;
    let v = cache.get(k);
    if (v === undefined) cache.set(k, (v = similarity(a, b)));
    return v;
  };
  for (let i = 1; i <= n; i++) {
    cur[0] = i * GAP;
    trace[i * (m + 1)] = 1;
    const a = sw[i - 1]!.w;
    for (let j = 1; j <= m; j++) {
      const s = sim(a, tw[j - 1]!.w);
      const sub = s >= 0.8 ? MATCH : s >= 0.6 ? FUZZY : MISMATCH;
      const d = prev[j - 1]! + sub;
      const u = prev[j]! + GAP;
      const l = cur[j - 1]! + GAP;
      const idx = i * (m + 1) + j;
      if (d >= u && d >= l) {
        cur[j] = d;
        trace[idx] = 0;
        kind[idx] = sub > 0 ? 1 : 0;
      } else if (u >= l) {
        cur[j] = u;
        trace[idx] = 1;
      } else {
        cur[j] = l;
        trace[idx] = 2;
      }
    }
    [prev, cur] = [cur, prev];
  }

  // Walk back and collect the matched transcript word of each script word.
  const matchOf: (AlignWord | null)[] = new Array(n).fill(null);
  /** Index of the matched transcript token of each script word, or -1. */
  const matchJ: number[] = new Array(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const idx = i * (m + 1) + j;
    const t = i === 0 ? 2 : j === 0 ? 1 : trace[idx]!;
    if (t === 0) {
      if (kind[idx]) {
        matchOf[i - 1] = tw[j - 1]!.word;
        matchJ[i - 1] = j - 1;
      }
      i--;
      j--;
    } else if (t === 1) i--;
    else j--;
  }

  let prevLastJ = -1;
  const out: LineAlignment[] = lines.map((_, line) => {
    const idx = sw.flatMap((x, k) => (x.line === line ? [k] : []));
    const hits = idx.map((k) => matchOf[k]).filter((w): w is AlignWord => w !== null);
    const matched = idx.length ? hits.length / idx.length : 0;
    const ok = matched >= 0.5;
    const js = idx.map((k) => matchJ[k]!).filter((x) => x >= 0);
    let startMs = ok ? hits[0]!.startMs : null;
    if (ok) {
      // The first words of the line can be heard differently (for example "128" and
      // "one hundred twenty eight"). Then the line starts at the first transcript word
      // after the previous line, if it is not far before the first match.
      const lead = idx.findIndex((k) => matchJ[k]! >= 0);
      const firstJ = js[0]!;
      if (lead > 0 && prevLastJ + 1 < firstJ) {
        const from = Math.max(prevLastJ + 1, firstJ - lead * 2);
        startMs = tw[from]!.word.startMs;
      }
      prevLastJ = js[js.length - 1]!;
    }
    return { line, startMs, endMs: ok ? hits[hits.length - 1]!.endMs : null, matched, unmatched: !ok };
  });
  // Speech recognition word times can be late, and word ends often run into the pause.
  // With the speech onsets of the audio, a line starts at the onset with the longest pause
  // before it, between the previous line start and the word time.
  if (opts.onsets?.length) {
    let prevStart = -Infinity;
    for (const a of out) {
      if (a.startMs === null) continue;
      const s = a.startMs;
      let best: Onset | undefined;
      for (const o of opts.onsets) {
        if (o.atMs <= prevStart + 300 || o.atMs > s + 150 || o.atMs < s - 2500) continue;
        if (!best || o.pauseMs > best.pauseMs || (o.pauseMs === best.pauseMs && o.atMs > best.atMs)) best = o;
      }
      if (best) a.startMs = best.atMs;
      prevStart = a.startMs;
    }
  }
  // Cue times must increase. A line that starts before the previous matched line is unmatched.
  let last = -1;
  for (const a of out) {
    if (a.startMs === null) continue;
    if (a.startMs <= last) {
      a.startMs = null;
      a.endMs = null;
      a.unmatched = true;
    } else last = a.startMs;
  }
  return out;
}

/**
 * Read transcript words from JSON: a list of { text, startMs, endMs }, an object
 * with "words", or the JSON output of whisper.cpp (`-oj` with `-ml 1`).
 * An error message has the form "message | hint".
 */
export function parseTranscriptJson(json: unknown): AlignWord[] {
  const list = Array.isArray(json) ? json : (json as { words?: unknown })?.words;
  if (Array.isArray(list)) {
    return list.map((w, i) => {
      const x = w as Partial<AlignWord>;
      if (typeof x.text !== "string" || typeof x.startMs !== "number" || typeof x.endMs !== "number") throw new Error(`Transcript word ${i + 1} is not valid. | Each word must have text, startMs, and endMs.`);
      return { text: x.text, startMs: x.startMs, endMs: x.endMs };
    });
  }
  const segs = (json as { transcription?: { text?: string; offsets?: { from?: number; to?: number } }[] })?.transcription;
  if (Array.isArray(segs)) {
    const out: AlignWord[] = [];
    for (const s of segs) {
      const text = (s.text ?? "").trim();
      // Special tokens such as [BLANK_AUDIO] and lone punctuation are not words.
      if (!text || /^\[.*\]$/.test(text) || !/[\p{L}\p{N}]/u.test(text)) continue;
      out.push({ text, startMs: s.offsets?.from ?? 0, endMs: s.offsets?.to ?? s.offsets?.from ?? 0 });
    }
    return out;
  }
  throw new Error("The transcript has an unknown format. | Use a JSON list of { text, startMs, endMs }, or whisper.cpp JSON output.");
}

