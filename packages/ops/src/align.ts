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
export function alignScript(lines: string[], transcript: AlignWord[]): LineAlignment[] {
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
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const idx = i * (m + 1) + j;
    const t = i === 0 ? 2 : j === 0 ? 1 : trace[idx]!;
    if (t === 0) {
      if (kind[idx]) matchOf[i - 1] = tw[j - 1]!.word;
      i--;
      j--;
    } else if (t === 1) i--;
    else j--;
  }

  const out: LineAlignment[] = lines.map((_, line) => {
    const idx = sw.flatMap((x, k) => (x.line === line ? [k] : []));
    const hits = idx.map((k) => matchOf[k]).filter((w): w is AlignWord => w !== null);
    const matched = idx.length ? hits.length / idx.length : 0;
    const ok = matched >= 0.5;
    return { line, startMs: ok ? hits[0]!.startMs : null, endMs: ok ? hits[hits.length - 1]!.endMs : null, matched, unmatched: !ok };
  });
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
