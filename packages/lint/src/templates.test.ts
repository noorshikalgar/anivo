import { readFileSync } from "node:fs";
import { resolveTimeline } from "@anivo/engine";
import { TEMPLATES, loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { lintScene } from "./lint.js";

describe("built-in templates (FR-FILE-08)", () => {
  it("has at least 10 templates", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });
  for (const t of TEMPLATES) {
    it(`${t.name} loads, has steps, and has no lint errors`, () => {
      const r = loadScene(JSON.parse(readFileSync(new URL(`../../../assets/templates/${t.name}.anivo.json`, import.meta.url), "utf8")));
      if (!r.ok) throw new Error(r.issues[0]!.message);
      expect(r.scene.meta.title).toBe(t.title);
      expect(resolveTimeline(r.scene).steps.length).toBeGreaterThanOrEqual(3);
      expect(lintScene(r.scene).filter((l) => l.level === "error")).toEqual([]);
    });
  }
});
