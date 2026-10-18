import { readFileSync, readdirSync } from "node:fs";
import { type IconPack, registerIconPack } from "@anivo/render";
import { type Scene, loadScene } from "@anivo/schema";
import { applyScript } from "@anivo/script";
import { beforeAll, describe, expect, it } from "vitest";
import { formatLint, lintScene, lintSummary } from "./lint.js";

beforeAll(() => {
  const dir = new URL("../../../assets/icons/", import.meta.url);
  for (const f of readdirSync(dir)) registerIconPack(JSON.parse(readFileSync(new URL(f, dir), "utf8")) as IconPack);
});

function script(text: string): Scene {
  const r = applyScript(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
}
const codes = (s: Scene) => lintScene(s).map((r) => r.code);

describe("lintScene", () => {
  it("finds no errors and no warnings in the templates", () => {
    const dir = new URL("../../../assets/templates/", import.meta.url);
    for (const f of readdirSync(dir)) {
      const r = loadScene(JSON.parse(readFileSync(new URL(f, dir), "utf8")));
      if (!r.ok) throw new Error(f);
      const results = lintScene(r.scene).filter((x) => x.level !== "info");
      expect(results, `${f}\n${formatLint(results)}`).toEqual([]);
    }
  });

  it("finds overlapping elements", () => {
    const s = script(`box a "A" at=100,100 size=200x100\nbox b "B" at=150,120 size=200x100\nstep "S"\n  enter a, b fade\n`);
    expect(codes(s)).toContain("overlap");
  });

  it("does not report a small shape inside a large frame as an overlap", () => {
    const s = script(`box frame "" at=100,100 size=800x600\nbox a "A" at=200,200 size=200x100\nstep "S"\n  enter frame, a fade\n`);
    expect(codes(s)).not.toContain("overlap");
  });

  it("finds text that does not fit, with a size hint", () => {
    const s = script(`box a "Extraordinarily long label here" at=100,100 size=120x40\nstep "S"\n  enter a fade\n`);
    const r = lintScene(s).find((x) => x.code === "text-overflow");
    expect(r?.level).toBe("error");
    expect(r?.hint).toMatch(/Make 'a' larger \(about \d+ x \d+\)/);
  });

  it("finds elements outside the camera", () => {
    const s = script(`box a "A" at=1800,100 size=300x100\nstep "S"\n  enter a fade\n`);
    expect(codes(s)).toContain("off-camera");
  });

  it("finds low contrast and tiny text", () => {
    const s = script(`box a "A" at=100,100 size=300x100 fill=surface color=surface-strong font-size=14\nstep "S"\n  enter a fade\n`);
    expect(codes(s)).toEqual(expect.arrayContaining(["low-contrast", "tiny-text"]));
  });

  it("measures text size against the short side of a portrait video", () => {
    const s = script(`scene size=1080x1920\nbox a "A" at=100,100 size=300x100 font-size=32\nstep "S"\n  enter a fade\n`);
    expect(codes(s)).not.toContain("tiny-text");
  });

  it("accepts a box inside a frame that is only a bit larger, but not two equal boxes", () => {
    const inFrame = script(`box win " " at=90,300 size=900x780\nbox site "Page" at=130,470 size=820x560\nstep "S"\n  enter win, site fade\n`);
    expect(codes(inFrame)).not.toContain("overlap");
    const same = script(`box a "A" at=100,100 size=300x200\nbox b "B" at=100,100 size=300x200\nstep "S"\n  enter a, b fade\n`);
    expect(codes(same)).toContain("overlap");
  });

  it("finds an unknown flow particle icon", () => {
    const s = script(`box a "A" at=100,100\nbox b "B" at=600,100\narrow a -> b\nstep "S"\n  enter a, b, a->b fade\n  flow a->b icon=nope:nothing\n`);
    expect(lintScene(s).find((r) => r.code === "unknown-icon")?.message).toMatch(/flow particle icon 'nope:nothing'/);
    const good = script(`box a "A" at=100,100\nbox b "B" at=600,100\narrow a -> b\nstep "S"\n  enter a, b, a->b fade\n  flow a->b icon=lucide:mail\n`);
    expect(codes(good)).not.toContain("unknown-icon");
  });

  it("finds an empty step, an unused element, an unknown icon, and an unknown color", () => {
    const s = script(`box a "A" at=100,100 fill=pinkish\nicon i nope:nothing "X" at=600,100\nbox z "Z" at=900,600\nstep "Empty"\nstep "S"\n  enter a, i fade\n  exit z fade\n`);
    const c = codes(s);
    expect(c).toEqual(expect.arrayContaining(["step-empty", "unknown-icon", "unknown-color"]));
    const s2 = script(`box a "A" at=100,100\nbox never "N" at=600,600\nstep "S"\n  enter a fade\n  enter never fade\n  exit never fade\n`);
    expect(lintScene(s2).some((r) => r.code === "action-conflict")).toBe(true);
  });

  it("reports each empty step, and unmatched script lines", () => {
    const s = script(`box a "A" at=100,100\nstep "One"\nstep "Two"\nstep "S"\n  enter a fade\n`);
    expect(lintScene(s).filter((r) => r.code === "step-empty")).toHaveLength(2);
    const withScript = { ...s, script: [{ id: "l1", text: "x", unmatched: true }, { id: "l2", text: "y" }, { id: "l3", text: "z", unmatched: true }] };
    expect(lintScene(withScript).find((r) => r.code === "script-unmatched")?.message).toMatch(/lines 1, 3 /);
  });

  it("finds an arrow that is visible while its element is not", () => {
    const s = script(`box a "A" at=100,100\nbox b "B" at=600,100\narrow a -> b\nstep "S"\n  enter a fade\n  enter a->b draw-on\nstep "T"\n  enter b pop\n`);
    expect(codes(s)).toContain("dangling-connector");
  });

  it("finds an arrow label that covers an element", () => {
    const s = script(`box a "A" at=100,100 size=200x80\nbox b "B" at=420,100 size=200x80\narrow a -> b "A long label on a short arrow"\nstep "S"\n  enter a, b, a->b fade\n`);
    expect(lintScene(s).filter((r) => r.code === "label-overlap").map((r) => r.ids[1])).toEqual(["a", "b"]);
    const ok = script(`box a "A" at=100,100 size=200x80\nbox b "B" at=900,100 size=200x80\narrow a -> b "Short"\nstep "S"\n  enter a, b, a->b fade\n`);
    expect(codes(ok)).not.toContain("label-overlap");
  });

  it("finds an arrow through a shape", () => {
    const s = script(`box a "A" at=100,400\nbox m "M" at=700,400\nbox b "B" at=1300,400\narrow a -> b\nstep "S"\n  enter a, m, b, a->b fade\n`);
    expect(codes(s)).toContain("connector-crosses");
  });

  it("sorts errors first and gives a summary and a text format", () => {
    const s = script(`box a "Extraordinarily long label" at=1800,100 size=120x40\nstep "S"\n  enter a fade\n`);
    const r = lintScene(s);
    expect(r[0]?.level).toBe("error");
    expect(lintSummary(r).errors).toBeGreaterThan(0);
    expect(formatLint(r)).toMatch(/^ERROR text-overflow \[s-s\]/);
    expect(formatLint([])).toBe("No problems.");
  });
});
