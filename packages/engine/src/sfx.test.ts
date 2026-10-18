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
});
