import { describe, expect, it } from "vitest";
import { audioSegments } from "./audio.js";

const scene = {
  assets: { a1: { id: "a1", mime: "audio/wav", bytes: 10 } },
  audio: [
    { id: "vo", kind: "voiceover" as const, assetId: "a1", durationMs: 4000, startMs: 1000, gainDb: -3, trimStartMs: 500 },
    { id: "gone", kind: "music" as const, assetId: "missing", durationMs: 4000, startMs: 0, gainDb: 0, trimStartMs: 0 },
  ],
};

describe("audioSegments", () => {
  it("clips a track to the range and keeps the trim", () => {
    // The track plays file time 500..4000 at scene time 1000..4500.
    expect(audioSegments(scene, 2000, 3000)).toEqual([{ trackId: "vo", assetId: "a1", mime: "audio/wav", atMs: 0, fromMs: 1500, toMs: 2500, gainDb: -3 }]);
    expect(audioSegments(scene, 0, 2000)[0]).toMatchObject({ atMs: 1000, fromMs: 500, toMs: 1500 });
  });
  it("skips tracks out of range and tracks with no asset", () => {
    expect(audioSegments(scene, 5000, 6000)).toEqual([]);
  });
});
