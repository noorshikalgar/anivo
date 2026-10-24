import { describe, expect, it } from "vitest";
import { formatCount } from "./evaluate.js";

describe("formatCount (docs/21 C9)", () => {
  it("writes plain, thousands, short, and time numbers", () => {
    expect(formatCount(12400.4, 0, undefined)).toBe("12400");
    expect(formatCount(1234567.891, 2, "thousands")).toBe("1,234,567.89");
    expect(formatCount(-9876, 0, "thousands")).toBe("-9,876");
    expect(formatCount(12400, 1, "compact")).toBe("12.4K");
    expect(formatCount(12400, 0, "compact")).toBe("12K");
    expect(formatCount(3_000_000, 1, "compact")).toBe("3.0M");
    expect(formatCount(950, 0, "compact")).toBe("950");
    expect(formatCount(65, 0, "duration")).toBe("1:05");
    expect(formatCount(3725.9, 0, "duration")).toBe("1:02:05");
  });
});

describe("rolling digits (docs/25 K4)", () => {
  it("shows the digit below while the next one rolls in, and the exact value at the end", async () => {
    const { loadScene } = await import("@anivo/schema");
    const { evaluate } = await import("./evaluate.js");
    const r = loadScene({
      schemaVersion: 1,
      meta: { title: "R" },
      elements: { n: { type: "text", z: "a1", width: 400, height: 100, content: { text: "0" } } },
      steps: [{ id: "s", title: "S", actions: [{ id: "c", type: "counter", targets: ["n"], durationMs: 1000, easing: "linear", counter: { from: 0, to: 10, roll: true } }] }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const at = (t: number) => evaluate(r.scene, t).elements.find((e) => e.id === "n")!;
    expect(at(370).label).toBe("3");
    expect(at(370).roll?.value).toBeCloseTo(3.7);
    expect(at(1000).label).toBe("10");
    expect(at(1000).roll).toBeUndefined();
  });
});
