import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { applyScript } from "./apply.js";
import { printScene } from "./print.js";

const ID = "0123456789abcdef";
const base = (() => {
  const r = loadScene({
    schemaVersion: 1,
    assets: { [ID]: { id: ID, mime: "image/png", bytes: 10 }, fedcba9876543210: { id: "fedcba9876543210", mime: "audio/wav", bytes: 10 } },
    audio: [{ id: "voiceover", kind: "voiceover", assetId: "fedcba9876543210", durationMs: 5000 }],
    script: [{ id: "l1", text: "Hello", stepId: "old-step" }],
    steps: [{ id: "old-step", title: "Old" }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.scene;
})();

describe("image element in Anivo Script", () => {
  it("compiles, prints, and compiles again to the same element", () => {
    const r = applyScript(`image logo asset=${ID} fit=cover at=100,100 size=300x200 radius=12\nstep "Show"\n  enter logo fade\n`, { base });
    if (!r.ok) throw new Error(r.errors[0]!.message);
    expect(r.scene.elements["logo"]).toMatchObject({ type: "image", assetId: ID, fit: "cover", width: 300, height: 200 });
    const printed = printScene(r.scene);
    expect(printed).toContain(`image logo asset=${ID} fit=cover at=100,100 size=300x200 radius=12`);
    const again = applyScript(printed, { base });
    if (!again.ok) throw new Error(again.errors[0]!.message);
    expect(again.scene.elements["logo"]).toEqual(r.scene.elements["logo"]);
  });

  it("needs an asset that exists and is an image", () => {
    const none = applyScript("image logo at=0,0\n", { base });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors[0]!.message).toBe("The image has no asset.");
    const missing = applyScript("image logo asset=1111111111111111\n", { base });
    expect(!missing.ok && missing.errors[0]!.message).toMatch(/does not exist/);
    const audio = applyScript("image logo asset=fedcba9876543210\n", { base });
    expect(!audio.ok && audio.errors[0]!.message).toMatch(/not an image/);
  });

  it("replace mode keeps assets, audio, and the script, and unlinks lines of removed steps", () => {
    const r = applyScript(`box a "A"\nstep "New"\n  enter a fade\n`, { base });
    if (!r.ok) throw new Error(r.errors[0]!.message);
    expect(Object.keys(r.scene.assets)).toHaveLength(2);
    expect(r.scene.audio).toHaveLength(1);
    expect(r.scene.script).toEqual([expect.objectContaining({ text: "Hello" })]);
    expect(r.scene.script[0]!.stepId).toBeUndefined();
  });
});
