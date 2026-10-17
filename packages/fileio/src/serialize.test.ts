import { readFileSync } from "node:fs";
import { OperationBus } from "@anivo/ops";
import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { sceneFromArchive, sceneFromBytes, sceneFromJson, sceneToArchive, sceneToJson } from "./serialize.js";

function load(input: unknown): Scene {
  const r = loadScene(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.scene;
}
const template = load(JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8")));

describe("scene JSON", () => {
  it("round-trips the template", () => {
    const r = sceneFromJson(sceneToJson(template));
    expect(r.ok && r.scene).toEqual(template);
  });

  it("round-trips a scene after many edits", () => {
    const bus = new OperationBus(template);
    bus.apply({
      ops: [
        { op: "element.add", type: "text", props: { content: "Hello", x: 10, y: 20, width: 300, height: 50, style: { fontSize: 48 } } },
        { op: "element.update", id: "lb", set: { style: { fill: "danger", strokeStyle: "dashed" }, rotation: 5 } },
        { op: "step.add", props: { title: "Extra", holdMs: 1000, trigger: { kind: "click" } } },
        { op: "action.add", step: "s-traffic", action: { type: "morph", targets: ["lb"], to: { y: 600, fill: "success" } } },
        { op: "scene.settings", set: { style: "sketch", video: { fps: 30 } } },
      ],
    });
    const r = sceneFromJson(sceneToJson(bus.scene));
    expect(r.ok && r.scene).toEqual(bus.scene);
  });

  it("omits default values and derived connector bounds", () => {
    const json = sceneToJson(template);
    const data = JSON.parse(json) as { elements: Record<string, Record<string, unknown>> };
    expect(data.elements["lb"]).not.toHaveProperty("opacity");
    expect(data.elements["lb"]).not.toHaveProperty("rotation");
    expect(data.elements["c-user-lb"]).not.toHaveProperty("x");
    expect(data.elements["lb"]).not.toHaveProperty("id");
  });

  it("is stable: the same scene gives the same text, and one label change changes one line", () => {
    const a = sceneToJson(template);
    expect(sceneToJson(template)).toBe(a);
    const bus = new OperationBus(template);
    bus.apply({ ops: [{ op: "element.update", id: "pod-2", set: { label: "api-2" } }] });
    const b = sceneToJson(bus.scene);
    const la = a.split("\n");
    const lb = b.split("\n");
    expect(lb.length).toBe(la.length);
    expect(la.filter((line, i) => line !== lb[i])).toHaveLength(1);
  });

  it("keeps required fields that equal a default (empty text, required ends)", () => {
    const bus = new OperationBus(template);
    bus.apply({ ops: [{ op: "element.add", id: "empty", type: "text", props: { content: "" } }] });
    const r = sceneFromJson(sceneToJson(bus.scene));
    expect(r.ok && r.scene.elements["empty"]).toMatchObject({ type: "text", content: { text: "" } });
  });

  it("reports invalid JSON", () => {
    const r = sceneFromJson("{ not json");
    expect(r.ok).toBe(false);
  });
});

describe("scene archive", () => {
  it("round-trips through a ZIP archive and detects the format", () => {
    const zip = sceneToArchive(template);
    expect(zip[0]).toBe(0x50);
    const r = sceneFromArchive(zip);
    expect(r.ok && r.scene).toEqual(template);
    const r2 = sceneFromBytes(new TextEncoder().encode(sceneToJson(template)));
    expect(r2.ok && r2.scene).toEqual(template);
  });

  it("gives the same bytes for the same scene", () => {
    expect(Buffer.from(sceneToArchive(template)).equals(Buffer.from(sceneToArchive(template)))).toBe(true);
  });

  it("rejects a file that is not an archive", () => {
    expect(sceneFromArchive(new Uint8Array([0x50, 0x4b, 1, 2, 3])).ok).toBe(false);
  });
});
