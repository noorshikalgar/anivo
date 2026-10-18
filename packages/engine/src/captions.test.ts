import { readFileSync } from "node:fs";
import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { captionAt, sceneCaptions, toSrt, toVtt, wrapCaption } from "./captions.js";
import { resolveTimeline } from "./timeline.js";

function load(input: unknown): Scene {
  const r = loadScene(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2));
  return r.scene;
}

const base = JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")) as { steps: { id: string }[] };
const ids = base.steps.map((s) => s.id);
const withScript = (script: unknown[], extra: Record<string, unknown> = {}) => load({ ...base, script, ...extra });

describe("wrapCaption", () => {
  it("wraps at 42 characters at word boundaries", () => {
    const lines = wrapCaption("The load balancer sends each request to one of the healthy pods in the pool");
    expect(lines.every((l) => l.length <= 42)).toBe(true);
    expect(lines.join(" ")).toBe("The load balancer sends each request to one of the healthy pods in the pool");
  });
});

describe("sceneCaptions", () => {
  it("makes one caption for each linked line, from step start to the next line", () => {
    const scene = withScript([
      { id: "l1", text: "A user sends a request.", stepId: ids[0] },
      { id: "l2", text: "The load balancer gets it.", stepId: ids[1] },
      { id: "l3", text: "Not linked." },
    ]);
    const tl = resolveTimeline(scene);
    const caps = sceneCaptions(scene);
    expect(caps).toHaveLength(2);
    expect(caps[0]).toEqual({ startMs: tl.steps[0]!.startMs, endMs: tl.steps[1]!.startMs, lines: ["A user sends a request."] });
    expect(caps[1]!.startMs).toBe(tl.steps[1]!.startMs);
    expect(captionAt(caps, tl.steps[1]!.startMs + 1)?.lines[0]).toBe("The load balancer gets it.");
  });

  it("divides a caption of more than 2 lines into parts", () => {
    const long = "word ".repeat(40).trim();
    const caps = sceneCaptions(withScript([{ id: "l1", text: long, stepId: ids[0] }]));
    expect(caps.length).toBeGreaterThan(1);
    expect(caps.every((c) => c.lines.length <= 2)).toBe(true);
    for (let i = 1; i < caps.length; i++) expect(caps[i]!.startMs).toBe(caps[i - 1]!.endMs);
  });

  it("ends at the last spoken word when the transcript has word times", () => {
    const scene = withScript([{ id: "l1", text: "Hello there.", stepId: ids[0] }], {
      assets: { "0123456789abcdef": { id: "0123456789abcdef", mime: "audio/wav", bytes: 10 } },
      audio: [{ id: "vo", kind: "voiceover", assetId: "0123456789abcdef", durationMs: 60000, transcript: { words: [{ text: "hello", startMs: 0, endMs: 400 }, { text: "there", startMs: 450, endMs: 900 }] } }],
    });
    expect(sceneCaptions(scene)[0]!.endMs).toBe(900);
  });
});

describe("SRT and WebVTT", () => {
  const caps = [
    { startMs: 0, endMs: 1500, lines: ["One"] },
    { startMs: 61_500, endMs: 3_725_042, lines: ["Two", "lines"] },
  ];
  it("writes SRT", () => {
    expect(toSrt(caps)).toBe("1\n00:00:00,000 --> 00:00:01,500\nOne\n\n2\n00:01:01,500 --> 01:02:05,042\nTwo\nlines\n");
  });
  it("writes WebVTT with times from the range start", () => {
    expect(toVtt(caps, { startMs: 1000, endMs: 62_000 })).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:00.500\nOne\n\n00:01:00.500 --> 00:01:01.000\nTwo\nlines\n");
  });
});
