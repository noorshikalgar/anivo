import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import { captionTiming, resolveTimeline } from "./timeline.js";

const scene = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "C" },
    elements: { a: { type: "rectangle", z: "a0", x: 100, y: 100, width: 200, height: 100 } },
    steps: [
      { id: "s1", holdMs: 0, caption: { text: "Alice and Bob talk through a server" }, actions: [{ id: "e", type: "enter", effect: "fade", targets: ["a"], durationMs: 300 }] },
      { id: "s2", holdMs: 0, actions: [{ id: "w", type: "wait", durationMs: 1000 }] },
    ],
  });
  if (!r.ok) throw new Error("scene");
  return r.scene;
};

describe("step caption", () => {
  it("the step holds until the caption can be read", () => {
    const s = scene();
    const c = captionTiming("Alice and Bob talk through a server");
    const tl = resolveTimeline(s);
    expect(tl.steps[0]!.holdEndMs).toBe(c.typeMs + c.readMs);
    expect(c.readMs).toBeGreaterThanOrEqual(2000);
  });

  it("types in, shows next to the first target, then fades in the next step", () => {
    const s = scene();
    const tl = resolveTimeline(s);
    const half = evaluate(s, tl.steps[0]!.caption!.typedMs / 2).caption!;
    expect(half.reveal).toBeGreaterThan(0.3);
    expect(half.reveal).toBeLessThan(0.7);
    const full = evaluate(s, tl.steps[0]!.holdEndMs - 10).caption!;
    expect(full).toMatchObject({ reveal: 1, opacity: 1, anchorId: "a", anchor: { x: 100, y: 100, width: 200, height: 100 } });
    const fading = evaluate(s, tl.steps[1]!.startMs + 125).caption!;
    expect(fading.opacity).toBeCloseTo(0.5, 1);
    expect(evaluate(s, tl.steps[1]!.startMs + 400).caption).toBeUndefined();
  });
});

describe("step caption anchor", () => {
  it("a group anchor uses the box of its parts", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "G" },
      elements: {
        g: { type: "group", z: "a0" },
        p1: { type: "rectangle", z: "a1", parentId: "g", x: 100, y: 100, width: 100, height: 100 },
        p2: { type: "rectangle", z: "a2", parentId: "g", x: 300, y: 150, width: 100, height: 200 },
      },
      steps: [{ id: "s1", caption: { text: "A group", anchor: "g" }, actions: [{ id: "e", type: "enter", effect: "fade", targets: ["g"] }] }],
    });
    if (!r.ok) throw new Error("scene");
    const c = evaluate(r.scene, 1500).caption!;
    expect(c.anchor).toEqual({ x: 100, y: 100, width: 300, height: 250 });
  });
});

describe("typewriter by word", () => {
  it("shows whole words only", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "W" },
      elements: { t: { type: "text", z: "a0", x: 0, y: 0, width: 600, height: 60, content: { text: "one two three four" } } },
      steps: [{ id: "s1", actions: [{ id: "e", type: "enter", effect: "typewriter", targets: ["t"], durationMs: 1000, easing: "linear", params: { unit: "word" } }] }],
    });
    if (!r.ok) throw new Error("scene");
    const reveal = (ms: number) => evaluate(r.scene, ms).elements.find((e) => e.id === "t")!.textReveal;
    expect(reveal(100)).toBe(0);
    expect(reveal(300)).toBeCloseTo(3 / 18, 5);
    expect(reveal(600)).toBeCloseTo(7 / 18, 5);
    expect(reveal(1000)).toBe(1);
  });
});

describe("camera drift and follow", () => {
  it("drift pushes in slowly; follow keeps a moving target in the center", () => {
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "Cam" },
      elements: { a: { type: "rectangle", z: "a0", x: 900, y: 500, width: 120, height: 80 } },
      steps: [
        { id: "s1", holdMs: 0, actions: [{ id: "d", type: "camera", camera: { op: "drift", zoom: 1.25 }, durationMs: 1000, easing: "linear" }] },
        {
          id: "s2",
          holdMs: 0,
          actions: [
            { id: "m", type: "morph", targets: ["a"], to: { x: 1500 }, durationMs: 1000, easing: "linear" },
            { id: "f", type: "camera", targets: ["a"], camera: { op: "follow" }, durationMs: 1000 },
          ],
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const end = evaluate(r.scene, 1000).camera;
    expect(end.width).toBeCloseTo(1920 / 1.25, 3);
    const tl = resolveTimeline(r.scene);
    const cam = evaluate(r.scene, tl.steps[1]!.startMs + 900).camera;
    const a = evaluate(r.scene, tl.steps[1]!.startMs + 900).elements.find((e) => e.id === "a")!;
    expect(cam.x + cam.width / 2).toBeCloseTo(a.x + a.width / 2, 0);
  });
});
