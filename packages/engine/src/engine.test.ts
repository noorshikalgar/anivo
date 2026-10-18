import { readFileSync } from "node:fs";
import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { cubicBezier, easingFn, spring } from "./easing.js";
import { evaluate, prepare, evaluateAt } from "./evaluate.js";
import { resolveTimeline } from "./timeline.js";

function load(input: unknown): Scene {
  const r = loadScene(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2));
  return r.scene;
}

const template = load(
  JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")),
);

const el = (frame: ReturnType<typeof evaluate>, id: string) => {
  const f = frame.elements.find((e) => e.id === id);
  if (!f) throw new Error(`no element ${id}`);
  return f;
};

const VOICE = {
  assets: { "0123456789abcdef": { id: "0123456789abcdef", mime: "audio/wav", bytes: 10 } },
  audio: [{ id: "vo", kind: "voiceover", assetId: "0123456789abcdef", durationMs: 20000 }],
};

function scene(steps: unknown[], elements: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Scene {
  return load({
    ...extra,
    schemaVersion: 1,
    elements: {
      a: { type: "rectangle", z: "a0", x: 0, y: 0, width: 100, height: 50, label: { text: "A" } },
      b: { type: "rectangle", z: "a1", x: 300, y: 0, width: 100, height: 50 },
      c: { type: "rectangle", z: "a2", x: 300, y: 200, width: 100, height: 50 },
      ab: { type: "connector", z: "a3", start: { kind: "bound", elementId: "a" }, end: { kind: "bound", elementId: "b" } },
      ac: { type: "connector", z: "a4", start: { kind: "bound", elementId: "a" }, end: { kind: "bound", elementId: "c" } },
      ...elements,
    },
    steps,
  });
}

describe("easing", () => {
  it("starts at 0 and ends at 1 for each named easing", () => {
    for (const name of ["linear", "ease-in", "ease-out", "ease-in-out", "back-out", "spring-soft", "spring-bouncy"] as const) {
      const f = easingFn(name);
      expect(f(0)).toBeCloseTo(0, 6);
      expect(f(1)).toBeCloseTo(1, 6);
    }
  });

  it("matches CSS ease-out at the middle", () => {
    // CSS cubic-bezier(0, 0, 0.58, 1) at x = 0.5 is approximately 0.6846 (checked with an independent bisection).
    expect(cubicBezier(0, 0, 0.58, 1)(0.5)).toBeCloseTo(0.6846, 3);
  });

  it("is monotonic for ease-in-out", () => {
    const f = easingFn("ease-in-out");
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = f(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("overshoots with a bouncy spring", () => {
    const f = spring(180, 12, 1);
    let max = 0;
    for (let i = 0; i <= 200; i++) max = Math.max(max, f(i / 200));
    expect(max).toBeGreaterThan(1.05);
  });
});

describe("resolveTimeline", () => {
  it("calculates absolute times for the load balancer template", () => {
    const tl = resolveTimeline(template);
    // Step 1: draw-on 800 ms + hold 500 ms.
    expect(tl.steps[0]).toMatchObject({ startMs: 0, endMs: 800, holdEndMs: 1300 });
    // Step 2: pop 500 ms; connector draw-on starts at +300 ms for 600 ms.
    expect(tl.steps[1]).toMatchObject({ startMs: 1300, endMs: 2200, holdEndMs: 2700 });
    // Step 3: pods pop at +400 ms with a 150 ms stagger: the last starts at +700 ms and ends at +1150 ms.
    expect(tl.steps[2]).toMatchObject({ startMs: 2700, endMs: 3850 });
    const pod3 = tl.steps[2]!.actions.find((a) => a.target === "pod-3")!;
    expect(pod3.startMs).toBe(2700 + 400 + 300);
    // Step 4: flow 3000 ms + hold 3000 ms.
    expect(tl.steps[3]).toMatchObject({ startMs: 4350, endMs: 7350, holdEndMs: 10350 });
    expect(tl.totalMs).toBe(10350);
  });

  it("warns when a cue starts before the previous step ends", () => {
    const s = scene([
      { id: "s1", actions: [{ id: "x1", type: "enter", effect: "fade", targets: ["a"], durationMs: 2000 }] },
      { id: "s2", trigger: { kind: "cue", audioId: "vo", atMs: 1000 }, actions: [] },
    ], {}, VOICE);
    const tl = resolveTimeline(s);
    expect(tl.warnings[0]?.code).toBe("step-overlap");
    expect(tl.steps[1]?.startMs).toBe(2500);
  });

  it("starts a cue step at the cue time", () => {
    const s = scene([
      { id: "s1", actions: [{ id: "x1", type: "enter", effect: "fade", targets: ["a"] }] },
      { id: "s2", trigger: { kind: "cue", audioId: "vo", atMs: 5000 }, actions: [] },
    ], {}, VOICE);
    expect(resolveTimeline(s).steps[1]?.startMs).toBe(5000);
  });
});

describe("evaluate", () => {
  it("is deterministic: scrub order does not change the frame", () => {
    const times = [9000, 10, 4400, 2950, 0, 7777, 1500, 3333];
    const first = times.map((t) => JSON.stringify(evaluate(template, t)));
    const reversed = [...times].reverse().map((t) => JSON.stringify(evaluate(template, t)));
    expect(first).toEqual(reversed.reverse());
    // A new prepared timeline gives the same frames.
    const p = prepare(template);
    expect(times.map((t) => JSON.stringify(evaluateAt(p, t)))).toEqual(first);
  });

  it("gives the same frame for 100 random times as sequential play (phase 0 gate)", () => {
    // Fixed linear congruential generator, so the test is deterministic.
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const total = resolveTimeline(template).totalMs;
    const times = Array.from({ length: 100 }, () => Math.floor(rand() * total));
    // Sequential play: one prepared timeline, times in increasing order.
    const playback = prepare(template);
    const sequential = new Map<number, string>();
    for (const t of [...times].sort((a, b) => a - b)) sequential.set(t, JSON.stringify(evaluateAt(playback, t)));
    // Scrub: a new prepared timeline, times in random order.
    const scrub = prepare(template);
    for (const t of times) expect(JSON.stringify(evaluateAt(scrub, t))).toBe(sequential.get(t));
  });

  it("gives the base state for a negative time", () => {
    const f = evaluate(template, -1);
    expect(el(f, "user").visible).toBe(false);
    expect(el(f, "user").strokeProgress).toBe(1);
    expect(f.timeMs).toBe(0);
  });

  it("applies an action on a group to the elements in the group", () => {
    const s = scene(
      [{ id: "s1", actions: [{ id: "g1", type: "enter", effect: "fade", targets: ["grp"], durationMs: 400 }] }],
      { grp: { type: "group", z: "a9" }, a: { type: "rectangle", z: "a0", parentId: "grp", width: 10, height: 10 }, b: { type: "rectangle", z: "a1", parentId: "grp", width: 10, height: 10 } },
    );
    expect(el(evaluate(s, -1), "a").visible).toBe(false);
    expect(el(evaluate(s, -1), "b").visible).toBe(false);
    expect(el(evaluate(s, 200), "b").opacity).toBeGreaterThan(0);
    expect(el(evaluate(s, 400), "a").opacity).toBe(1);
  });

  it("zooms the camera to targets in the video aspect ratio, then resets", () => {
    const s = scene([
      { id: "s1", holdMs: 0, actions: [{ id: "c1", type: "camera", targets: ["a"], camera: { op: "zoom-to", padding: 20 }, durationMs: 1000, easing: "linear" }] },
      { id: "s2", holdMs: 0, actions: [{ id: "c2", type: "camera", camera: { op: "reset" }, durationMs: 1000, easing: "linear" }] },
    ]);
    const end = evaluate(s, 1000).camera;
    expect(end.width / end.height).toBeCloseTo(1920 / 1080, 6);
    expect(end.x + end.width / 2).toBeCloseTo(50, 6);
    expect(end.width).toBeCloseTo(((50 + 40) * 1920) / 1080, 4);
    // The zoom moves in log scale: half time gives the geometric mean of the widths.
    const mid = evaluate(s, 500).camera;
    expect(mid.width).toBeCloseTo(Math.sqrt(1920 * end.width), 3);
    expect(evaluate(s, 2000).camera).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(evaluate(s, -1).camera).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("counts a number in a text element", () => {
    const s = scene(
      [{ id: "s1", actions: [{ id: "n1", type: "counter", targets: ["t"], counter: { from: 0, to: 1200, format: "{n} req/s" }, durationMs: 1000, easing: "linear" }] }],
      { t: { type: "text", z: "a9", content: { text: "0 req/s" } } },
    );
    expect(el(evaluate(s, 500), "t").label).toBe("600 req/s");
    expect(el(evaluate(s, 5000), "t").label).toBe("1200 req/s");
  });

  it("highlights code lines and grows a code block during a diff", () => {
    const s = scene(
      [
        { id: "s1", holdMs: 0, actions: [{ id: "h1", type: "code", targets: ["code"], code: { op: "highlight", lines: [2, 2] }, durationMs: 400 }] },
        { id: "s2", holdMs: 0, actions: [{ id: "d1", type: "code", targets: ["code"], code: { op: "diff", newCode: "a\nb\nc\nd" }, durationMs: 1000, easing: "linear" }] },
      ],
      { code: { type: "code", z: "a9", code: "a\nb", width: 300, height: 120 } },
    );
    expect(el(evaluate(s, 400), "code").codeLines).toEqual([2, 2]);
    expect(el(evaluate(s, 200), "code").codeLinesMix).toBeGreaterThan(0);
    const mid = el(evaluate(s, 900), "code");
    expect(mid.codeFrom).toBe("a\nb");
    expect(mid.height).toBeCloseTo(120 + 2 * 36 * 0.5, 6);
    expect(el(evaluate(s, 5000), "code")).toMatchObject({ code: "a\nb\nc\nd", height: 192 });
  });

  it("makes the timeline as long as the voiceover", () => {
    const s = scene([{ id: "s1", actions: [{ id: "x1", type: "enter", effect: "fade", targets: ["a"] }] }], {}, VOICE);
    expect(resolveTimeline(s).totalMs).toBe(20000);
  });

  it("keeps an element visible when its first action is not enter", () => {
    const s = scene([{ id: "s1", actions: [{ id: "x1", type: "emphasis", effect: "pulse", targets: ["a"] }] }]);
    expect(el(evaluate(s, 0), "a").visible).toBe(true);
  });

  it("hides an element before its enter action and shows it after", () => {
    expect(el(evaluate(template, 0), "lb").visible).toBe(false);
    expect(el(evaluate(template, 1299), "lb").visible).toBe(false);
    expect(el(evaluate(template, 1300), "lb").visible).toBe(true);
    expect(el(evaluate(template, 9000), "lb").visible).toBe(true);
  });

  it("draws the stroke first, then the fill, during draw-on", () => {
    const mid = el(evaluate(template, 300), "user");
    expect(mid.strokeProgress).toBeGreaterThan(0);
    expect(mid.strokeProgress).toBeLessThan(1);
    expect(mid.fillProgress).toBe(0);
    const end = el(evaluate(template, 800), "user");
    expect(end.strokeProgress).toBe(1);
    expect(end.fillProgress).toBe(1);
  });

  it("overshoots the scale during pop", () => {
    let max = 0;
    for (let t = 1300; t <= 1800; t += 10) max = Math.max(max, el(evaluate(template, t), "lb").scale);
    expect(max).toBeGreaterThan(1.02);
    expect(el(evaluate(template, 1800), "lb").scale).toBeCloseTo(1, 6);
  });

  it("morphs numbers, colors, and labels", () => {
    const s = scene([
      { id: "s1", actions: [{ id: "m1", type: "morph", targets: ["a"], to: { x: 200, fill: "danger", label: "B" }, durationMs: 1000, easing: "linear" }] },
    ]);
    const mid = el(evaluate(s, 500), "a");
    expect(mid.x).toBeCloseTo(100, 6);
    expect(mid.fill).toEqual({ from: "default", to: "danger", p: 0.5 });
    expect(mid).toMatchObject({ labelFrom: "A", label: "B", labelMix: 0.5 });
    const end = el(evaluate(s, 1000), "a");
    expect(end).toMatchObject({ x: 200, fill: "danger", label: "B" });
    expect(end.labelFrom).toBeUndefined();
    // The next step starts from the morphed state.
    const s2 = scene([
      { id: "s1", actions: [{ id: "m1", type: "morph", targets: ["a"], to: { x: 200 } }] },
      { id: "s2", actions: [{ id: "p1", type: "emphasis", effect: "pulse", targets: ["a"] }] },
    ]);
    expect(el(evaluate(s2, 5000), "a").x).toBe(200);
  });

  it("hides an element after its exit action", () => {
    const s = scene([{ id: "s1", actions: [{ id: "x1", type: "exit", effect: "fade", targets: ["a"], durationMs: 400 }] }]);
    expect(el(evaluate(s, 200), "a").visible).toBe(true);
    expect(el(evaluate(s, 200), "a").opacity).toBeLessThan(1);
    expect(el(evaluate(s, 400), "a").visible).toBe(false);
    expect(el(evaluate(s, 3000), "a").visible).toBe(false);
  });

  it("does not keep emphasis effects after the action", () => {
    const s = scene([{ id: "s1", actions: [{ id: "x1", type: "emphasis", effect: "shake", targets: ["a"], durationMs: 800 }] }]);
    expect(Math.abs(el(evaluate(s, 100), "a").offsetX)).toBeGreaterThan(0);
    expect(el(evaluate(s, 800), "a").offsetX).toBe(0);
  });

  it("dims other elements during focus", () => {
    const s = scene([{ id: "s1", actions: [{ id: "f1", type: "emphasis", effect: "focus", targets: ["a"], durationMs: 1000 }] }]);
    const f = evaluate(s, 500);
    expect(el(f, "a").opacity).toBe(1);
    expect(el(f, "b").opacity).toBeCloseTo(0.25, 6);
    expect(el(evaluate(s, 1000), "b").opacity).toBe(1);
  });

  it("distributes flow particles round-robin and skips connectors", () => {
    const s = scene([
      { id: "s1", holdMs: 0, actions: [{ id: "f1", type: "flow", targets: ["ab", "ac"], durationMs: 2000, flow: { rate: 4, speed: 100, distribute: "round-robin" } }] },
    ]);
    const len = () => 1000;
    const f = evaluate(s, 1999, { connectorLength: len });
    const counts = { ab: 0, ac: 0 } as Record<string, number>;
    for (const p of f.particles) counts[p.connectorId]!++;
    expect(counts["ab"]).toBe(4);
    expect(counts["ac"]).toBe(4);

    const skip = scene([
      { id: "s1", actions: [{ id: "f1", type: "flow", targets: ["ab", "ac"], flow: { distribute: "round-robin", skip: ["ac"] } }] },
    ]);
    expect(evaluate(skip, 1500, { connectorLength: len }).particles.every((p) => p.connectorId === "ab")).toBe(true);
  });

  it("delays chained particles by the travel time of the source connector", () => {
    const s = scene([
      { id: "s1", actions: [{ id: "f1", type: "flow", targets: ["ac"], durationMs: 3000, flow: { rate: 1, speed: 100, chainFrom: "ab" } }] },
    ]);
    const len = () => 200; // 2 seconds of travel on the source.
    expect(evaluate(s, 1999, { connectorLength: len }).particles).toHaveLength(0);
    expect(evaluate(s, 2500, { connectorLength: len }).particles[0]?.distance).toBeCloseTo(50, 6);
  });

  it("drops particles past the connector end", () => {
    const s = scene([{ id: "s1", actions: [{ id: "f1", type: "flow", targets: ["ab"], durationMs: 5000, flow: { rate: 1, speed: 100 } }] }]);
    const f = evaluate(s, 4500, { connectorLength: () => 250 });
    for (const p of f.particles) expect(p.distance).toBeLessThanOrEqual(250);
    expect(f.particles.length).toBe(3);
  });

  it("returns elements in draw order and the base camera", () => {
    const f = evaluate(template, 0);
    expect(f.elements.map((e) => e.id)).toEqual(["user", "lb", "pod-1", "pod-2", "pod-3", "c-user-lb", "c-lb-1", "c-lb-2", "c-lb-3"]);
    expect(f.camera).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});
