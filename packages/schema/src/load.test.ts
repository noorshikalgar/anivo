import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScene } from "./load.js";

const template = JSON.parse(
  readFileSync(new URL("../../../assets/templates/load-balancer.anivo.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

function mustLoad(input: unknown) {
  const r = loadScene(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2));
  return r;
}

describe("loadScene", () => {
  it("loads the load balancer template and fills defaults", () => {
    const { scene } = mustLoad(template);
    expect(Object.keys(scene.elements)).toHaveLength(9);
    expect(scene.steps).toHaveLength(4);
    expect(scene.settings.video).toEqual({ width: 1920, height: 1080, fps: 60 });
    expect(scene.settings.defaults.defaultIconPack).toBe("lucide");
    const lb = scene.elements["lb"];
    expect(lb?.id).toBe("lb");
    expect(lb?.opacity).toBe(1);
  });

  it("reports an unknown action target with a path and the valid IDs", () => {
    const r = loadScene({
      schemaVersion: 1,
      elements: { a: { type: "rectangle", z: "a0" } },
      steps: [{ id: "s1", actions: [{ id: "x1", type: "enter", effect: "fade", targets: ["b"] }] }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]?.path).toBe("steps.0.actions.0.targets.0");
    expect(r.issues[0]?.message).toContain("Use one of: a");
  });

  it("rejects an element ID that does not match its key", () => {
    const r = loadScene({ schemaVersion: 1, elements: { a: { id: "b", type: "rectangle", z: "a0" } } });
    expect(r.ok).toBe(false);
  });

  it("rejects a flow on an element that is not a connector", () => {
    const r = loadScene({
      schemaVersion: 1,
      elements: { a: { type: "rectangle", z: "a0" } },
      steps: [{ id: "s1", actions: [{ id: "f1", type: "flow", targets: ["a"] }] }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid element ID", () => {
    const r = loadScene({ schemaVersion: 1, elements: { "Bad ID": { type: "rectangle", z: "a0" } } });
    expect(r.ok).toBe(false);
  });

  it("opens a newer file read-only", () => {
    const r = mustLoad({ ...template, schemaVersion: 99 });
    expect(r.readOnly).toBe(true);
  });
});
