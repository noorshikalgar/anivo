import { loadScene } from "@anivo/schema";
import { describe, expect, it } from "vitest";
import { OperationBus } from "./bus.js";
import { WIDGETS, getWidget, widgetOps } from "./widgets.js";

const empty = () => {
  const r = loadScene({ schemaVersion: 1, meta: { title: "W" } });
  if (!r.ok) throw new Error("scene");
  return r.scene;
};

describe("widgets", () => {
  it("inserts each widget as a valid group of plain elements", () => {
    for (const w of WIDGETS) {
      const bus = new OperationBus(empty());
      const r = bus.apply({ ops: widgetOps(w, { id: "w", x: 100, y: 50 }) });
      expect(r.ok, `${w.name}: ${!r.ok ? r.error.message : ""}`).toBe(true);
      const parts = Object.values(bus.scene.elements).filter((e) => e.parentId === "w");
      expect(parts.length, w.name).toBe(w.parts.length);
      expect(bus.scene.elements["w"]!.type).toBe("group");
    }
  });

  it("scales the parts and sets the texts", () => {
    const bus = new OperationBus(empty());
    const def = getWidget("stat")!;
    bus.apply({ ops: widgetOps(def, { id: "kpi", x: 0, y: 0, width: 640, height: 380, texts: { value: "42 ms" } }) });
    const value = bus.scene.elements["kpi-value"]!;
    expect(value.type === "text" && value.content.text).toBe("42 ms");
    expect(value.width).toBe(560);
    expect(value.style.fontSize).toBe(136);
  });
});
