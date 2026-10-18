import { readFileSync } from "node:fs";
import { OperationBus } from "@anivo/ops";
import { Action, type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { assetId, packArchive, packJson, unpack } from "./assets.js";
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

  it("round-trips a motion action, a shape morph, and an action sound", () => {
    const bus = new OperationBus(template);
    const r = bus.apply({
      ops: [
        { op: "action.add", step: template.steps[0]!.id, action: { type: "motion", targets: ["user"], motion: { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], curve: true } } },
        { op: "action.add", step: template.steps[0]!.id, action: { type: "morph", targets: ["lb"], to: { shape: "ellipse" }, sound: "pop" } },
      ],
    });
    expect(r.ok).toBe(true);
    const back = sceneFromJson(sceneToJson(bus.scene));
    expect(back.ok && back.scene.steps[0]).toEqual(bus.scene.steps[0]);
  });

  it("round-trips an image element with its asset", () => {
    const bus = new OperationBus(template);
    const r = bus.apply({
      ops: [
        { op: "asset.add", asset: { id: "00000000000000ab", mime: "image/png", bytes: 3 } },
        { op: "element.add", id: "pic", type: "image", props: { assetId: "00000000000000ab", x: 10, y: 10, width: 200, height: 100 } },
      ],
    });
    expect(r.ok).toBe(true);
    const back = sceneFromJson(sceneToJson(bus.scene));
    expect(back.ok && back.scene.elements["pic"]).toEqual(bus.scene.elements["pic"]);
  });

  it("round-trips every action type and a code element", () => {
    const bus = new OperationBus(template);
    const r = bus.apply({
      ops: [
        { op: "element.add", id: "snippet", type: "code", props: { code: "const a = 1;\nconst b = 2;", language: "ts", x: 100, y: 100, width: 500, height: 120 } },
        { op: "element.add", id: "rps", type: "text", props: { content: "0", x: 100, y: 400, width: 300, height: 60 } },
        {
          op: "step.add",
          id: "s-all",
          props: {
            actions: [
              { type: "camera", targets: ["lb"], camera: { op: "zoom-to", padding: 40 } },
              { type: "camera", camera: { op: "pan", rect: { x: 0, y: 0, width: 960, height: 540 } } },
              { type: "camera", camera: { op: "reset" } },
              { type: "counter", targets: ["rps"], counter: { from: 0, to: 9, format: "{n} req/s", decimals: 1 } },
              { type: "code", targets: ["snippet"], code: { op: "highlight", lines: [2, 2] } },
              { type: "code", targets: ["snippet"], code: { op: "diff", newCode: "const a = 3;" } },
              { type: "wait", durationMs: 500 },
              { type: "emphasis", effect: "glow", targets: ["lb"], params: { color: "success" } },
              { type: "motion", targets: ["lb"], motion: { points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] } },
              { type: "exit", effect: "fade", targets: ["pod-3"] },
              { type: "enter", effect: "pop", targets: ["pod-3"], params: { scale: 0.5 } },
              { type: "morph", targets: ["lb"], to: { fill: "#ff0000" } },
              { type: "flow", targets: ["c-lb-1"], flow: { dots: 3 } },
            ],
          },
        },
      ],
    });
    expect(r.ok).toBe(true);
    const back = sceneFromJson(sceneToJson(bus.scene));
    expect(back.ok && back.scene).toEqual(bus.scene);
    // A new action type must be added to this test.
    const types = new Set(bus.scene.steps.flatMap((st) => st.actions.map((a) => a.type)));
    for (const t of Action.options.map((o) => o.shape.type.value)) expect(types, `action type '${t}'`).toContain(t);
  });

  it("keeps audio, script, and asset bytes in the archive and in JSON", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250]);
    const id = assetId(bytes);
    const bus = new OperationBus(template);
    const r = bus.apply({
      ops: [
        { op: "asset.add", asset: { id, mime: "audio/wav", bytes: bytes.length, name: "vo.wav" } },
        { op: "audio.add", track: { kind: "voiceover", assetId: id, durationMs: 9000 } },
        { op: "script.set", lines: [{ text: "Hello", stepId: "s-user" }] },
        { op: "step.update", id: "s-lb", set: { trigger: { kind: "cue", audioId: "voiceover", atMs: 2000 } } },
      ],
    });
    expect(r.ok).toBe(true);
    const assets = new Map([[id, bytes]]);
    for (const packed of [packArchive(bus.scene, assets), new TextEncoder().encode(packJson(bus.scene, assets))]) {
      const back = unpack(packed);
      expect(back.ok).toBe(true);
      if (!back.ok) return;
      expect(back.scene).toEqual(bus.scene);
      expect([...back.assets.get(id)!]).toEqual([...bytes]);
    }
    // Removing the track turns its cue trigger into an automatic start.
    bus.apply({ ops: [{ op: "audio.remove", id: "voiceover" }] });
    expect(bus.scene.steps[1]!.trigger).toEqual({ kind: "auto" });
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
