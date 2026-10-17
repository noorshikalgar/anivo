import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyScript } from "./apply.js";

/** Code blocks that start with a scene line, from a Markdown file. */
function sceneBlocks(path: string): string[] {
  const md = readFileSync(new URL(path, import.meta.url), "utf8");
  // Skip reference blocks with <placeholders>.
  return [...md.matchAll(/```\n(scene [\s\S]*?)```/g)].map((m) => m[1]!).filter((b) => !b.includes("<"));
}

describe("lexer", () => {
  it("ends on any input", () => {
    const r = applyScript("box a > b < | ~ \u2026 \"x\" ->\n");
    expect(r.ok).toBe(false);
  });

  it("ends on 2000 random lines (fuzz)", () => {
    let seed = 42;
    const rand = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    const chars = 'abz09 -_>,="+.:*#\\\n  \t()[]{}|<~@/';
    for (let i = 0; i < 2000; i++) {
      let line = "";
      for (let j = 0; j < 30; j++) line += chars[rand(chars.length)];
      applyScript(line);
    }
  });
});

describe("examples in the documents compile", () => {
  for (const file of ["../../../docs/09-agent-interface.md", "../../../prompts/scene-agent.md"]) {
    it(file.split("/").pop()!, () => {
      const blocks = sceneBlocks(file);
      expect(blocks.length).toBeGreaterThan(0);
      for (const b of blocks) {
        const r = applyScript(b);
        if (!r.ok) throw new Error(r.errors.map((e) => `${e.line}:${e.col} ${e.message} ${e.hint ?? ""}`).join("\n"));
      }
    });
  }
});
