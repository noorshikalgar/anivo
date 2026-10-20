import { readFileSync } from "node:fs";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { SOUNDS, soundCues, synthSound, wavBytes } from "./sfx.js";
import { resolveTimeline } from "./timeline.js";

describe("sound effects", () => {
  it("synthesizes each sound the same way each time, in range", () => {
    for (const s of SOUNDS) {
      const a = synthSound(s, 48000);
      expect(a.length).toBeGreaterThan(1000);
      expect(a).toEqual(synthSound(s, 48000));
      expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(1);
      expect(Math.max(...a.map(Math.abs))).toBeGreaterThan(0.05);
    }
    const wav = wavBytes(synthSound("pop", 8000), 8000);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
  });

  it("puts each sound at the start of its action", () => {
    const base = JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")) as { steps: { actions: Record<string, unknown>[] }[] };
    base.steps[1]!.actions[0]!["sound"] = "pop";
    base.steps[1]!.actions[1]!["sound"] = "whoosh";
    base.steps[1]!.actions[1]!["soundGainDb"] = -12;
    const r = loadScene(base);
    if (!r.ok) throw new Error("fixture");
    const tl = resolveTimeline(r.scene);
    const cues = soundCues(r.scene, tl);
    expect(cues).toEqual([
      { atMs: tl.steps[1]!.startMs, sound: "pop", gainDb: -6 },
      { atMs: tl.steps[1]!.startMs + (base.steps[1]!.actions[1]!["delayMs"] as number), sound: "whoosh", gainDb: -12 },
    ]);
  });

  it("repeats keys and ticks for the whole action", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "S" },
      elements: { t: { type: "text", z: "a0", x: 0, y: 0, width: 300, height: 60, content: { text: "Hello there" } } },
      steps: [{ id: "s1", actions: [{ id: "a1", type: "enter", effect: "typewriter", targets: ["t"], durationMs: 1000, sound: "keys" }, { id: "a2", type: "emphasis", effect: "pulse", targets: ["t"], sound: "chime" }] }],
    });
    if (!r.ok) throw new Error("scene");
    const cues = soundCues(r.scene);
    const keys = cues.filter((c) => c.sound === "key");
    expect(keys.length).toBeGreaterThan(12);
    expect(keys.at(-1)!.atMs).toBeLessThan(1000);
    expect(cues.filter((c) => c.sound === "chime")).toHaveLength(1);
  });
});
