import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import { resolveTimeline } from "./timeline.js";

const scene = () => {
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "K" },
    elements: {
      a: {
        type: "text",
        z: "a1",
        x: 100,
        y: 100,
        width: 400,
        height: 100,
        content: { text: "Hi" },
        keys: { opacity: [{ t: 0, v: 0, ease: "linear" }, { t: 2000, v: 1 }], x: [{ t: 1000, v: 100, ease: "linear" }, { t: 3000, v: 500 }], textColor: [{ t: 0, v: "accent" }, { t: 1000, v: "#ff0000" }] },
      },
    },
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.scene;
};
const at = (t: number) => evaluate(scene(), t).elements.find((e) => e.id === "a")!;

describe("element keyframes (docs/32)", () => {
  it("a key at 0 sets the value from the very start", () => {
    expect(at(0).opacity).toBe(0);
    expect(at(1000).opacity).toBeCloseTo(0.5);
    expect(at(2500).opacity).toBe(1);
  });
  it("holds the first value before the first key, and the last after the last", () => {
    expect(at(500).x).toBe(100);
    expect(at(2000).x).toBeCloseTo(300);
    expect(at(9000).x).toBe(500);
  });
  it("mixes colors between keys", () => {
    expect(at(0).textColor).toBe("accent");
    expect(at(500).textColor).toMatchObject({ from: "accent", to: "#ff0000" });
    expect(at(1500).textColor).toBe("#ff0000");
  });
  it("makes the video last until the last key", () => {
    expect(resolveTimeline(scene()).totalMs).toBe(3000);
  });
});
