import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import { resolveTimeline } from "./timeline.js";

const scene = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "M" },
    elements: { t: { type: "text", z: "a0", x: 0, y: 0, width: 900, height: 80, content: { text: "the cat saw the dog" } } },
    steps: [
      { id: "s1", holdMs: 0, actions: [{ id: "m1", type: "mark", targets: ["t"], durationMs: 400, easing: "linear", mark: { phrase: "the", occurrence: 2, color: "accent", underline: "accent" } }] },
      { id: "s2", holdMs: 0, actions: [{ id: "m2", type: "mark", targets: ["t"], durationMs: 400, easing: "linear", mark: { phrase: "cat", highlight: "warning-soft", dim: "muted" } }] },
      { id: "s3", holdMs: 0, actions: [{ id: "m3", type: "mark", targets: ["t"], durationMs: 400, easing: "linear", mark: { clear: true } }] },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.scene;
};
const at = (ms: number) => evaluate(scene(), ms).elements.find((e) => e.id === "t")!;

describe("mark words", () => {
  it("marks the second 'the' by whole words, and the mark grows with the action", () => {
    expect(at(200).marks).toEqual([{ start: 12, end: 15, color: "accent", underline: "accent", p: 0.5 }]);
    expect(at(400).marks![0]!.p).toBe(1);
  });

  it("keeps earlier marks in the next step, and dims the rest", () => {
    const f = at(800);
    expect(f.marks!.map((m) => [m.start, m.end])).toEqual([
      [12, 15],
      [4, 7],
    ]);
    expect(f.dimRest).toEqual({ color: "muted", p: 1 });
  });

  it("clear fades the marks out", () => {
    const tl = resolveTimeline(scene());
    const s3 = tl.steps[2]!.startMs;
    expect(at(s3 + 200).marks![0]!.p).toBeCloseTo(0.5, 5);
    expect(at(s3 + 200).dimRest!.p).toBeCloseTo(0.5, 5);
    expect(at(s3 + 400).marks).toBeUndefined();
    expect(at(s3 + 400).dimRest).toBeUndefined();
  });
});

describe("letter effects", () => {
  it("cascade and scramble run with the action, then settle", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "L" },
      elements: { t: { type: "text", z: "a0", x: 0, y: 0, width: 600, height: 80, content: { text: "hello" } } },
      steps: [
        { id: "s1", holdMs: 0, actions: [{ id: "c", type: "enter", effect: "cascade", targets: ["t"], durationMs: 1000, easing: "linear" }] },
        { id: "s2", holdMs: 0, actions: [{ id: "x", type: "emphasis", effect: "pulse", targets: ["t"], durationMs: 100 }] },
      ],
    });
    if (!r.ok) throw new Error("scene");
    expect(evaluate(r.scene, 500).elements[0]!.cascade).toBeCloseTo(0.5, 5);
    expect(evaluate(r.scene, 1050).elements[0]!.cascade).toBeUndefined();
  });
});
