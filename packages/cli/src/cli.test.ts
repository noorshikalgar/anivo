import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../bin/anivo.js", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "anivo-cli-"));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

function anivo(...args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 120_000 });
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

  it.skipIf(!hasFfmpeg)("renders an MP4 of a step range", () => {
    const r = anivo("--json", "render", scene, "--out", join(dir, "v.mp4"), "--size", "320x180", "--fps", "24", "--steps", "2", "--quality", "draft");
    expect(r.code, r.err).toBe(0);
    const info = JSON.parse(r.out);
    expect(info.frames).toBeGreaterThan(10);
  });
}, 300_000);
