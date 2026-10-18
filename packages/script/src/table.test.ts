import { describe, expect, it } from "vitest";
import { OperationBus } from "@anivo/ops";
import { resolveTimeline } from "@anivo/engine";
import { applyScript } from "./apply.js";
import { printScene } from "./print.js";

const SCRIPT = `table users at=100,100 size=600x192
  "id" "name" "email"
  "1" "Ana" "ana@example.com"
  "2" "Bo" "bo@example.com"
step "Show"
  enter users fade
  highlight users-r2c2
`;

function ok(text: string) {
  const r = applyScript(text);
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.line}:${e.col} ${e.message}`).join("\n"));
  return r.scene;
}

describe("table element", () => {
  it("makes a text cell for each row and column, with stable IDs and boxes", () => {
    const s = ok(SCRIPT);
    expect(s.elements["users"]).toMatchObject({ type: "table", rows: 3, cols: 3, header: true });
    const cell = s.elements["users-r2c3"]!;
    expect(cell).toMatchObject({ type: "text", parentId: "users", x: 500, y: 164, width: 200, height: 64, content: { text: "ana@example.com" } });
    expect(s.elements["users-r1c1"]!.style.fontWeight).toBe(700);
  });

  it("an action on the table applies to the grid and all cells", () => {
    const tl = resolveTimeline(ok(SCRIPT));
    const targets = tl.steps[0]!.actions.filter((a) => a.action.type === "enter").map((a) => a.target);
    expect(targets).toHaveLength(10);
    expect(targets[0]).toBe("users");
  });

  it("prints and compiles again to the same scene", () => {
    const s = ok(SCRIPT);
    const printed = printScene(s);
    expect(printed).toContain('table users at=100,100 size=600x192\n  "id" "name" "email"\n  "1" "Ana" "ana@example.com"');
    expect(printed).not.toContain("users-r1c1 ");
    const again = ok(printed);
    expect(again.elements).toEqual(s.elements);
  });

  it("moves, adds, and removes cells when the table changes", () => {
    const bus = new OperationBus(ok(SCRIPT));
    expect(bus.apply({ ops: [{ op: "element.update", id: "users", set: { x: 200, cols: 2, rows: 4 } }] }).ok).toBe(true);
    const e = bus.scene.elements;
    expect(e["users-r1c3"]).toBeUndefined();
    expect(e["users-r4c2"]).toMatchObject({ parentId: "users", content: { text: "" } });
    expect(e["users-r2c2"]).toMatchObject({ x: 500, y: 148, width: 300, height: 48, content: { text: "Ana" } });
    expect(bus.apply({ ops: [{ op: "element.remove", ids: ["users"] }] }).ok).toBe(true);
    expect(Object.keys(bus.scene.elements).filter((id) => id.startsWith("users"))).toEqual([]);
  });

  it("reports a row that is not strings", () => {
    const r = applyScript(`table t\n  "a" b\n`);
    expect(!r.ok && r.errors[0]!.message).toBe("A table row must contain cell texts only.");
  });
});
