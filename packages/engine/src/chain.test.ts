import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { resolveTimeline } from "./timeline.js";

const scene = (actions: unknown[]) => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "C" },
    elements: { a: { type: "rectangle", z: "a1", width: 10, height: 10 }, b: { type: "rectangle", z: "a2", width: 10, height: 10 }, c: { type: "rectangle", z: "a3", width: 10, height: 10 } },
    steps: [{ id: "s", title: "S", actions }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.scene;
};
const starts = (t: ReturnType<typeof resolveTimeline>) => Object.fromEntries(t.steps[0]!.actions.map((x) => [x.action.id, x.startMs]));

describe("chains (docs/21 C7)", () => {
  it("starts an action when the action it follows ends, with the gap", () => {
    const t = resolveTimeline(
      scene([
        { id: "x", type: "enter", effect: "fade", targets: ["a"], delayMs: 300, durationMs: 500 },
        { id: "y", type: "enter", effect: "fade", targets: ["b"], after: "x", delayMs: 100, durationMs: 400 },
        { id: "z", type: "enter", effect: "fade", targets: ["c"], after: "y", durationMs: 400 },
      ]),
    );
    expect(starts(t)).toEqual({ x: 300, y: 900, z: 1300 });
  });
  it("ignores a chain to a missing action and a chain that comes back to itself", () => {
    const t = resolveTimeline(
      scene([
        { id: "x", type: "enter", effect: "fade", targets: ["a"], after: "y", durationMs: 500 },
        { id: "y", type: "enter", effect: "fade", targets: ["b"], after: "x", durationMs: 500 },
        { id: "z", type: "enter", effect: "fade", targets: ["c"], after: "gone", delayMs: 50, durationMs: 500 },
      ]),
    );
    expect(starts(t).z).toBe(50);
    expect(Number.isFinite(starts(t).x)).toBe(true);
  });
});
