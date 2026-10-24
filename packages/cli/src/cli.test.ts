import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../bin/anivo.js", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "anivo-cli-"));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const userIcons = mkdtempSync(join(tmpdir(), "anivo-icons-"));

function anivo(...args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 120_000, env: { ...process.env, ANIVO_ICONS_DIR: userIcons } });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

const SCRIPT = `scene "CLI test"
box a "A"
box b "B" right-of=a
arrow a -> b
step "One"
  enter a, b pop
  enter a->b draw-on +300ms
step "Two"
  flow a->b rate=2
`;

describe("anivo CLI", () => {
  const scene = join(dir, "s.anivo");
  writeFileSync(join(dir, "s.anivo.txt"), SCRIPT);

  it("applies a script, prints it, and summarizes it", () => {
    const r = anivo("apply", scene, join(dir, "s.anivo.txt"));
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/Lint: 0 errors/);
    const p = anivo("print", scene);
    expect(p.out).toMatch(/^scene "CLI test"/);
    expect(p.out).toContain("arrow a -> b");
    expect(anivo("summary", scene).out).toMatch(/Steps \(2\):/);
  });

  it("saves and inserts a composition, and applies a preset (docs/25 K5)", () => {
    const c = join(dir, "c.anivo");
    anivo("apply", c, join(dir, "s.anivo.txt"));
    const comp = join(dir, "ab.anivo-comp.json");
    const saved = anivo("comp", "save", c, "--ids", "a,b", "--out", comp);
    expect(saved.code, saved.err).toBe(0);
    expect(saved.out).toContain('a="A"');
    const ins = anivo("comp", "insert", c, comp, "--at", "100,700", "--text", "a=Again");
    expect(ins.code, ins.err).toBe(0);
    expect(anivo("print", c).out).toContain('"Again"');
    const p = anivo("preset", "apply", c, "rise-in", "--step", "s-one", "--targets", "a,b");
    expect(p.code, p.err).toBe(0);
    expect(p.out).toContain("Applied 'Rise in' (2 actions)");
  });

  it("writes a filmstrip of one step (docs/26 M1)", () => {
    const out = join(dir, "strip.png");
    const r = anivo("filmstrip", scene, "--step", "1", "--count", "4", "--out", out);
    expect(r.code, r.err).toBe(0);
    expect(statSync(out).size).toBeGreaterThan(1000);
    expect(anivo("filmstrip", scene, "--step", "9").code).toBe(1);
  });

  it("returns exit code 1 for lint errors and for a missing file, with a hint", () => {
    writeFileSync(join(dir, "bad.txt"), `box a "A very long label that cannot fit" size=100x40\nstep "S"\n  enter a fade\n`);
    anivo("apply", join(dir, "bad.anivo"), join(dir, "bad.txt"));
    expect(anivo("lint", join(dir, "bad.anivo")).code).toBe(1);
    const m = anivo("summary", join(dir, "missing.anivo"));
    expect(m.code).toBe(1);
    expect(m.err).toContain("does not exist");
  });

  it("reports script errors with line and column", () => {
    writeFileSync(join(dir, "err.txt"), `box a "A"\nbox a "B"\n`);
    const r = anivo("apply", join(dir, "err.anivo"), join(dir, "err.txt"));
    expect(r.code).toBe(1);
    expect(r.err).toContain("line 2, column 5: The ID 'a' is used two times.");
  });

  it("sets the script and writes SRT and WebVTT captions", () => {
    const sc = join(dir, "cap.anivo");
    expect(anivo("apply", sc, join(dir, "s.anivo.txt")).code).toBe(0);
    expect(anivo("captions", sc).code).toBe(1);
    writeFileSync(join(dir, "lines.txt"), "First the boxes appear.\nThen data flows.\n");
    expect(anivo("script", sc, join(dir, "lines.txt")).code).toBe(0);
    const srt = anivo("captions", sc);
    expect(srt.out).toMatch(/^1\n00:00:00,000 --> 00:00:\d\d,\d{3}\nFirst the boxes appear.\n\n2\n/);
    const vtt = join(dir, "cap.vtt");
    expect(anivo("captions", sc, "--out", vtt).code).toBe(0);
    expect(readFileSync(vtt, "utf8")).toMatch(/^WEBVTT\n/);
  });

  it.skipIf(!hasFfmpeg)("adds an image and renders it in the preview", () => {
    const sc = join(dir, "img.anivo");
    expect(anivo("apply", sc, join(dir, "s.anivo.txt")).code).toBe(0);
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=4x2", "-frames:v", "1", join(dir, "red.png")]);
    const r = anivo("image", "add", sc, join(dir, "red.png"), "--id", "logo", "--at", "600,600", "--width", "400");
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/Added image 'logo' \(asset [0-9a-f]{16}, 4×2 px\)/);
    expect(anivo("print", sc).out).toMatch(/image logo asset=[0-9a-f]{16} at=600,600 size=400x200/);
    const out = join(dir, "img.png");
    expect(anivo("preview", sc, "--step", "0", "--out", out).code).toBe(0);
    expect(anivo("image", "add", sc, join(dir, "s.anivo.txt")).err).toContain("Use a PNG, JPEG, WebP, or SVG file.");
  });

  it("writes an SVG file for each step", () => {
    const folder = join(dir, "svgs");
    const r = anivo("export", scene, "--format", "svg-steps", "--out", folder);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/Wrote 2 SVG files/);
    const svg = readFileSync(join(folder, "01-s-one.svg"), "utf8");
    expect(svg).toMatch(/^<svg xmlns/);
    expect(svg).toContain(">A</text>");
  });

  it("writes a self-contained HTML player file", () => {
    const out = join(dir, "s.html");
    const r = anivo("html", scene, "--out", out, "--loop");
    expect(r.code, r.err).toBe(0);
    const html = readFileSync(out, "utf8");
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<anivo-player controls loop>");
    expect(html).toContain('<script type="module">');
  });

  it("imports Mermaid from a Markdown file", () => {
    const md = join(dir, "flow.md");
    writeFileSync(md, "# Flow\n\n```mermaid\nflowchart LR\n  a[Client] --> b[Server]\n```\n");
    const out = join(dir, "flow.anivo");
    const r = anivo("import", md, "--out", out);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("Imported mermaid: 3 elements, 2 steps.");
    expect(anivo("import", md, "--out", out).err).toContain("exists already");
    expect(anivo("print", out).out).toContain('box a "Client"');
  });

  it("adds an icon pack from a folder of SVG files and finds its icons", () => {
    const folder = join(dir, "brand");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "Rocket Ship.svg"), '<svg viewBox="0 0 24 24" fill="none" stroke="black"><path d="M2 2L22 22"/></svg>');
    writeFileSync(join(folder, "notes.txt"), "not an icon");
    const r = anivo("icons", "add", folder);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("Added icon pack 'brand': 1 icons (stroke).");
    expect(anivo("icons", "search", "rocket", "--pack", "brand").out.trim()).toBe("brand:rocket-ship");
    expect(anivo("icons", "packs").out).toMatch(/brand: 1 icons/);
    expect(anivo("icons", "add", folder, "--name", "lucide").err).toContain("bundled pack");
  });

  it("writes a preview and a contact sheet", () => {
    expect(anivo("preview", scene, "--step", "1", "--debug", "--out", join(dir, "p.png")).code).toBe(0);
    expect(readFileSync(join(dir, "p.png")).subarray(1, 4).toString()).toBe("PNG");
    expect(anivo("contact-sheet", scene, "--out", join(dir, "c.png")).code).toBe(0);
    expect(statSync(join(dir, "c.png")).size).toBeGreaterThan(1000);
    expect(anivo("preview", scene, "--step", "9").err).toContain("The step '9' does not exist.");
  });

  it("converts to the folder format and back", () => {
    const folder = join(dir, "folder.anivo/");
    expect(anivo("convert", scene, folder).code).toBe(0);
    expect(existsSync(join(folder, "scene.json"))).toBe(true);
    expect(anivo("convert", folder, join(dir, "back.json")).code).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "back.json"), "utf8")).meta.title).toBe("CLI test");
  });

  it("prints JSON Schema and JSON output", () => {
    expect(JSON.parse(anivo("schema", "--kind", "ops").out).type).toBe("object");
    expect(JSON.parse(anivo("--json", "lint", scene).out).summary.errors).toBe(0);
    expect(anivo("icons", "search", "server", "--limit", "1").out.trim()).toBe("lucide:server");
  });

  it.skipIf(!hasFfmpeg)("adds a voiceover and a script, and keeps the audio when the file changes", () => {
    const wav = join(dir, "vo.wav");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", wav]);
    const r = anivo("audio", "add", scene, wav);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("Added voiceover track 'voiceover' (3.0 s)");
    writeFileSync(join(dir, "lines.txt"), "First line\n\nSecond line\nThird line\n");
    expect(anivo("script", scene, join(dir, "lines.txt")).out).toContain("Set 3 script lines. 1 lines have no step.");
    // A later change saves the file again: the audio bytes must stay.
    writeFileSync(join(dir, "more.txt"), `box c "C" at=100,700\n`);
    expect(anivo("apply", scene, join(dir, "more.txt"), "--mode", "append").code).toBe(0);
    const json = join(dir, "check.json");
    expect(anivo("convert", scene, json).code).toBe(0);
    const data = JSON.parse(readFileSync(json, "utf8"));
    expect(data.audio[0].durationMs).toBe(3000);
    expect(Object.keys(data.assetData)).toHaveLength(1);
    expect(data.script.map((l: { text: string }) => l.text)).toEqual(["First line", "Second line", "Third line"]);
    expect(anivo("audio", "add", scene, join(dir, "lines.txt")).err).toContain("type that Anivo does not read");
  });

  it.skipIf(!hasFfmpeg)("aligns the script to a transcript file and sets cues", () => {
    // The scene from the test above has a voiceover. Line 3 is not in the transcript.
    writeFileSync(join(dir, "lines3.txt"), "First line\nSecond line\nThe end of the video\n");
    expect(anivo("script", scene, join(dir, "lines3.txt")).code).toBe(0);
    const t = join(dir, "words.json");
    writeFileSync(t, JSON.stringify({ transcription: [
      { offsets: { from: 200, to: 500 }, text: " First" }, { offsets: { from: 500, to: 800 }, text: " line" },
      { offsets: { from: 1500, to: 1800 }, text: " Second" }, { offsets: { from: 1800, to: 2100 }, text: " line" },
    ] }));
    const r = anivo("align", scene, "--transcript", t);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/1\. 0\.20 s {2}First line/);
    expect(r.out).toMatch(/2\. 1\.50 s {2}Second line/);
    expect(r.out, r.out).toMatch(/3\. unmatched {2}The end of the video/);
    expect(r.out).toContain("Aligned 2 of 3 lines.");
    expect(anivo("transcribe", scene, "--model", join(dir, "missing.bin")).err).toContain("whisper.cpp model");
  });

  it.skipIf(!hasFfmpeg)("renders an MP4 of a step range", () => {
    const r = anivo("--json", "render", scene, "--out", join(dir, "v.mp4"), "--size", "320x180", "--fps", "24", "--steps", "2", "--quality", "draft");
    expect(r.code, r.err).toBe(0);
    const info = JSON.parse(r.out);
    expect(info.frames).toBeGreaterThan(10);
  });
}, 300_000);
