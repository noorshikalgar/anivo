/**
 * Alignment accuracy check (docs/13, phase 3 exit gate): "Alignment puts 90% of
 * cues within 300 ms of a manual cue on 5 test recordings."
 *
 * The recordings are synthetic, so the true start of each line is exact:
 * each line is spoken alone with macOS `say` (5 voices), the speech onset is
 * found with FFmpeg silencedetect, and the lines are joined with pauses.
 * Then the editor transcribes the voiceover with Whisper in the browser, and
 * alignScript finds the start of each line.
 *
 * Needs: macOS (`say`), FFmpeg, and the network one time (the Whisper model).
 * Run:   pnpm eval:align [--model Xenova/whisper-base.en] [--no-snap]
 * Output: a table and evals/results/alignment-<date>.json
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { alignScript, speechOnsets } from "@anivo/ops";

const args = process.argv.slice(2);
const MODEL = args[args.indexOf("--model") + 1] && args.includes("--model") ? args[args.indexOf("--model") + 1]! : "Xenova/whisper-base.en";
const URL = "http://localhost:5173/";
const NO_SNAP = args.includes("--no-snap");
const RATE = 16000;

const RECORDINGS: { voice: string; lines: string[] }[] = [
  { voice: "Samantha", lines: ["A user opens the web site.", "The load balancer gets the request.", "It sends the request to one of three pods.", "Pod three crashes.", "Kubernetes starts a new pod.", "Traffic flows again."] },
  { voice: "Daniel", lines: ["The client sends a SYN packet.", "The server answers with SYN-ACK.", "The client sends ACK.", "Now the connection is open.", "Data can flow both ways."] },
  { voice: "Karen", lines: ["Each Docker image has layers.", "The base layer is the operating system.", "Then come the dependencies.", "The top layer is your code.", "A code change rebuilds only the top layer.", "The other layers come from the cache."] },
  { voice: "Moira", lines: ["The app looks in the cache first.", "It is a miss.", "So the app reads from the database.", "It writes the result to the cache.", "The next read is a cache hit in two milliseconds."] },
  { voice: "Rishi", lines: ["A developer pushes a commit.", "The pipeline builds the code.", "One hundred twenty eight tests pass.", "The pipeline deploys to production.", "Users get the new version in minutes."] },
];

function ffmpeg(...a: string[]): void {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
}

/** Seconds of the clip, and the start of speech (end of the first silence at the start). */
function measure(file: string): { duration: number; onset: number } {
  const r = spawnSync("ffmpeg", ["-v", "info", "-i", file, "-af", "silencedetect=noise=-45dB:d=0.05", "-f", "null", "-"], { encoding: "utf8" });
  const duration = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr)!.slice(1).reduce((s, v, i) => s + Number(v) * [3600, 60, 1][i]!, 0));
  const first = /silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+)/.exec(r.stderr);
  const onset = first && Number(first[1]) <= 0.01 ? Number(first[2]) : 0;
  return { duration, onset };
}

async function waitForServer(): Promise<(() => void) | null> {
  const ok = async () => fetch(URL).then((r) => r.ok, () => false);
  if (await ok()) return null;
  const p = spawn("pnpm", ["--filter", "@anivo/web", "dev"], { stdio: "ignore", detached: true });
  for (let i = 0; i < 120 && !(await ok()); i++) await new Promise((r) => setTimeout(r, 500));
  return () => process.kill(-p.pid!);
}

const dir = mkdtempSync(join(tmpdir(), "anivo-align-"));
const stop = await waitForServer();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => localStorage.setItem("anivo.tourDone", "1"));
await page.goto(URL);
await page.getByRole("navigation", { name: "Steps" }).waitFor();

const transcripts: Record<string, { text: string; startMs: number; endMs: number }[]> = {};
const rows: { voice: string; line: number; truthMs: number; cueMs: number | null; errMs: number | null }[] = [];
for (const [ri, rec] of RECORDINGS.entries()) {
  // 1. Speak each line, then join the lines with pauses of 0.5 to 1.3 s.
  const parts: string[] = [];
  const truth: number[] = [];
  let t = 0.4;
  ffmpeg("-f", "lavfi", "-i", `anullsrc=r=${RATE}:cl=mono`, "-t", "0.4", join(dir, `r${ri}-pad0.wav`));
  parts.push(join(dir, `r${ri}-pad0.wav`));
  rec.lines.forEach((line, li) => {
    const aiff = join(dir, `r${ri}-${li}.aiff`);
    const wav = join(dir, `r${ri}-${li}.wav`);
    execFileSync("say", ["-v", rec.voice, "-o", aiff, line]);
    ffmpeg("-i", aiff, "-ar", String(RATE), "-ac", "1", wav);
    const m = measure(wav);
    truth.push(Math.round((t + m.onset) * 1000));
    parts.push(wav);
    t += m.duration;
    const gap = 0.5 + ((li * 37 + ri * 11) % 9) / 10;
    const pad = join(dir, `r${ri}-pad${li + 1}.wav`);
    ffmpeg("-f", "lavfi", "-i", `anullsrc=r=${RATE}:cl=mono`, "-t", String(gap), pad);
    parts.push(pad);
    t += gap;
  });
  const list = join(dir, `r${ri}.txt`);
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  const full = join(dir, `r${ri}.wav`);
  ffmpeg("-f", "concat", "-safe", "0", "-i", list, "-c:a", "pcm_s16le", full);

  // 2. Open a scene with one step for each line, add the voiceover, transcribe it.
  const scene = { schemaVersion: 1, meta: { title: `Alignment ${rec.voice}` }, steps: rec.lines.map((_, i) => ({ id: `s${i + 1}`, title: `Line ${i + 1}` })) };
  await page.evaluate((s) => (window as unknown as { __anivoOpen(j: unknown): boolean }).__anivoOpen(s), scene);
  await page.evaluate(([b64, v]) => (window as unknown as { __anivoAddAudio(b: string, n: string, k: string): Promise<string> }).__anivoAddAudio(b64!, `${v}.wav`, "voiceover"), [readFileSync(full).toString("base64"), rec.voice]);
  process.stderr.write(`${rec.voice}: transcribing… `);
  const words = (await page.evaluate((m) => (window as unknown as { __anivoTranscribe(m: string): Promise<{ text: string; startMs: number; endMs: number }[]> }).__anivoTranscribe(m), MODEL)) as { text: string; startMs: number; endMs: number }[];
  transcripts[rec.voice] = words;
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", full, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"], { maxBuffer: 1 << 28 });
  const onsets = speechOnsets(new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4), RATE);
  const result = alignScript(rec.lines, words, NO_SNAP ? {} : { onsets });
  process.stderr.write(`${words.length} words\n`);
  result.forEach((a, li) => rows.push({ voice: rec.voice, line: li + 1, truthMs: truth[li]!, cueMs: a.startMs, errMs: a.startMs === null ? null : a.startMs - truth[li]! }));
}
await browser.close();
stop?.();

const within = rows.filter((r) => r.errMs !== null && Math.abs(r.errMs) <= 300).length;
const pct = (within / rows.length) * 100;
const errs = rows.flatMap((r) => (r.errMs === null ? [] : [Math.abs(r.errMs)])).sort((a, b) => a - b);
console.log("\n| Voice | Line | True start (ms) | Cue (ms) | Error (ms) |\n|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.voice} | ${r.line} | ${r.truthMs} | ${r.cueMs ?? "unmatched"} | ${r.errMs ?? "-"} |`);
console.log(`\nModel ${MODEL}. ${within} of ${rows.length} cues (${pct.toFixed(1)}%) are within 300 ms. Median error ${errs[Math.floor(errs.length / 2)] ?? "-"} ms, maximum ${errs[errs.length - 1] ?? "-"} ms.`);
console.log(`Phase 3 gate (90% within 300 ms): ${pct >= 90 ? "PASS" : "FAIL"}`);
mkdirSync("evals/results", { recursive: true });
writeFileSync(join("evals", "results", `alignment-${new Date().toISOString().slice(0, 10)}.json`), `${JSON.stringify({ model: MODEL, within, total: rows.length, percent: pct, rows, transcripts }, null, 2)}\n`);
