import { readFileSync } from "node:fs";
import { type Scene, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { applyScript } from "./apply.js";
import { printScene } from "./print.js";

const files = [
  "../../schema/fixtures/v1-load-balancer.json",
  "../../../assets/templates/load-balancer.anivo.json",
  "../../../assets/templates/tcp-handshake.anivo.json",
  "../../../assets/templates/docker-layers.anivo.json",
];

function load(path: string): Scene {
  const r = loadScene(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")));
  if (!r.ok) throw new Error(path);
  return r.scene;
}

/** The scene without the values that the bus makes again: draw-order keys and seeds. */
function normalize(scene: Scene) {
  const elements = Object.fromEntries(
    Object.values(scene.elements)
      .sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0))
      .map((e, i) => [e.id, { ...e, z: i, seed: 0 }]),
  );
  return { meta: { title: scene.meta.title }, settings: scene.settings, elements, steps: scene.steps };
}

describe("printScene round trip", () => {
  it("round-trips a group with an arrow inside", () => {
    const r = applyScript(`group g\n  box a "A" at=0,0\n  box b "B" at=400,0\n  arrow a -> b\nbox c "C" at=0,300\n`);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.scene.elements["c-a-b"]?.parentId).toBe("g");
    const again = applyScript(printScene(r.scene));
    if (!again.ok) throw new Error(JSON.stringify(again.errors));
    expect(normalize(again.scene)).toEqual(normalize(r.scene));
  });

  for (const f of files) {
    it(`compile(print(scene)) equals the scene: ${f.split("/").pop()}`, () => {
      const scene = load(f);
      const text = printScene(scene);
      const r = applyScript(text);
      if (!r.ok) throw new Error(`${r.errors.map((e) => `${e.line}:${e.col} ${e.message}`).join("\n")}\n---\n${text}`);
      expect(normalize(r.scene)).toEqual(normalize(scene));
      // print(compile(print(s))) is stable.
      expect(printScene(r.scene)).toBe(text);
    });
  }
});
