import { readFileSync } from "node:fs";
import { resolveTimeline } from "@anivo/engine";
import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { planTake, spliceTake, trimTake, voiceParts } from "./takes.js";

const fixture = (): Scene => {
  const r = loadScene(JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")));
  if (!r.ok) throw new Error("fixture");
  return r.scene;
};

/** Apply a plan as the editor does: the new voiceover replaces the old one. */
function applyPlan(scene: Scene, stepId: string, takeMs: number): Scene {
  const plan = planTake(scene, stepId, takeMs);
  const old = scene.audio.find((t) => t.kind === "voiceover");
  const oldPlay = plan.keepToMs - plan.keepFromMs;
  const newMs = oldPlay - (plan.cutToMs - plan.cutFromMs) + plan.silenceBeforeMs + takeMs + plan.silenceAfterMs;
  const bus = new OperationBus(scene);
  const r = bus.apply({
    ops: [
      ...(old ? [{ op: "audio.remove" as const, id: old.id }] : []),
      { op: "asset.add", asset: { id: `00000000000000${String(newMs % 100).padStart(2, "0")}`, mime: "audio/wav", bytes: 1 } },
      { op: "audio.add", track: { id: plan.trackId, kind: "voiceover", assetId: `00000000000000${String(newMs % 100).padStart(2, "0")}`, durationMs: newMs, startMs: plan.trackStartMs } },
      ...plan.ops,
    ],
  });
  if (!r.ok) throw new Error(r.error.message);
  return bus.scene;
}

describe("planTake", () => {
  it("records the steps one by one, and each step lasts as long as its voice or its animation", () => {
    let s = fixture();
    const ids = s.steps.map((x) => x.id);
    s = applyPlan(s, ids[0]!, 9000); // long voice
    s = applyPlan(s, ids[1]!, 10); // short voice: silence fills the animation
    const parts = voiceParts(s);
    expect(parts.map((p) => p.stepId)).toEqual(ids.slice(0, 2));
    expect(parts[0]).toMatchObject({ fromMs: 0, toMs: 9000 });
    const t = resolveTimeline(s);
    expect(t.warnings).toEqual([]);
    expect(t.steps[1]!.startMs).toBe(9000);
    expect(parts[1]!.toMs - parts[1]!.fromMs).toBe(t.steps[1]!.holdEndMs - t.steps[1]!.startMs);
  });

  it("replaces one take and moves the later cues by the change in length", () => {
    let s = fixture();
    const ids = s.steps.map((x) => x.id);
    for (const id of ids) s = applyPlan(s, id, 8000);
    const before = voiceParts(s);
    const plan = planTake(s, ids[0]!, 9500);
    expect(plan).toMatchObject({ cutFromMs: 0, cutToMs: 8000, silenceBeforeMs: 0, silenceAfterMs: 0 });
    s = applyPlan(s, ids[0]!, 9500);
    const after = voiceParts(s);
    expect(after.map((p) => p.fromMs - before.find((b) => b.stepId === p.stepId)!.fromMs)).toEqual([0, ...ids.slice(1).map(() => 1500)]);
    expect(resolveTimeline(s).warnings).toEqual([]);
  });

  it("starts a take after the end of the voice where the step starts", () => {
    const s = fixture();
    const last = s.steps.at(-1)!;
    const plan = planTake(s, last.id, 1000);
    expect(plan.silenceBeforeMs).toBe(resolveTimeline(s).steps.at(-1)!.startMs);
    const after = applyPlan(s, last.id, 1000);
    expect(resolveTimeline(after).warnings).toEqual([]);
  });
});

describe("spliceTake and trimTake", () => {
  const rate = 1000;
  it("puts the take in place of the old part, with silence around it", () => {
    const old = Float32Array.from({ length: 10 }, (_, i) => i + 1);
    const take = Float32Array.from([9, 9]);
    const out = spliceTake(old, take, rate, { trackId: "voiceover", trackStartMs: 0, keepFromMs: 0, keepToMs: 10, cutFromMs: 3, cutToMs: 6, silenceBeforeMs: 1, silenceAfterMs: 2, ops: [] });
    expect([...out]).toEqual([1, 2, 3, 0, 9, 9, 0, 0, 7, 8, 9, 10]);
  });

  it("removes the silence around the speech and keeps a pad", () => {
    const r = 16000;
    const take = new Float32Array(r * 3);
    for (let i = r; i < r * 2; i++) take[i] = Math.sin(i / 5) * 0.5;
    const out = trimTake(take, r, 250);
    expect(out.length / r).toBeGreaterThan(1.3);
    expect(out.length / r).toBeLessThan(1.7);
    expect(() => trimTake(new Float32Array(r), r)).toThrow(/no speech/);
  });
});
