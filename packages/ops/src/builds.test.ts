import { resolveTimeline, evaluate } from "@anivo/engine";
import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { bulletListBuild } from "./builds.js";
import { OperationBus } from "./bus.js";

describe("bullet list build", () => {
  it("types the title, then each point in the center, then moves it up under the title", () => {
    const r = loadScene({ schemaVersion: 1, meta: { title: "B" } });
    if (!r.ok) throw new Error("scene");
    const bus = new OperationBus(r.scene);
    const res = bus.apply({ ops: bulletListBuild(r.scene, { title: "Why caching", points: ["Faster reads", "Less load"], emptyFirst: true }) });
    expect(res.ok).toBe(true);
    const s = bus.scene;
    expect(s.steps.map((x) => x.title)).toEqual(["Start", "Title", "Point 1", "Point 1 up", "Point 2", "Point 2 up"]);
    const tl = resolveTimeline(s);
    const center = evaluate(s, tl.steps[2]!.endMs).elements.find((e) => e.id === "point-1")!;
    const moved = evaluate(s, tl.steps[3]!.endMs).elements.find((e) => e.id === "point-1")!;
    const title = s.elements["title"]!;
    expect(center.visible).toBe(true);
    expect(center.y).toBeGreaterThan(400);
    expect(moved.y).toBeLessThan(400);
    expect(moved.y).toBeGreaterThan(title.y + title.height);
  });
});
