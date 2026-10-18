import { resolveTimeline } from "@anivo/engine";
import { describe, expect, it } from "vitest";
import { ImportError, importExcalidraw } from "./excalidraw.js";

const base = { strokeColor: "#1e1e1e", backgroundColor: "transparent", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, angle: 0 };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const doc = {
  type: "excalidraw",
  version: 2,
  elements: [
    { ...base, id: "R1", type: "rectangle", x: 100, y: 100, width: 200, height: 80, backgroundColor: "#a5d8ff", roundness: { type: 3 }, boundElements: [{ id: "T1", type: "text" }, { id: "A1", type: "arrow" }], groupIds: ["G1"] },
    { ...base, id: "T1", type: "text", x: 150, y: 125, width: 100, height: 25, text: "Load balancer", originalText: "Load balancer", fontSize: 20, containerId: "R1", groupIds: ["G1"] },
    { ...base, id: "E1", type: "ellipse", x: 500, y: 100, width: 160, height: 80, strokeColor: "#e03131", boundElements: [{ id: "A1", type: "arrow" }], groupIds: ["G1"] },
    { ...base, id: "A1", type: "arrow", x: 300, y: 140, width: 200, height: 0, points: [[0, 0], [200, 0]], startBinding: { elementId: "R1" }, endBinding: { elementId: "E1" }, endArrowhead: "arrow", strokeStyle: "dashed" },
    { ...base, id: "T2", type: "text", x: 100, y: 300, width: 120, height: 25, text: "A note", originalText: "A note", fontSize: 20 },
    { ...base, id: "L1", type: "line", x: 100, y: 400, width: 300, height: 50, points: [[0, 0], [150, 50], [300, 0]] },
    { ...base, id: "F1", type: "freedraw", x: 0, y: 0, width: 10, height: 10 },
    { ...base, id: "I1", type: "image", x: 700, y: 300, width: 64, height: 64, fileId: "file1" },
    { ...base, id: "D1", type: "rectangle", x: 0, y: 0, width: 5, height: 5, isDeleted: true },
  ],
  files: { file1: { mimeType: "image/png", dataURL: PNG } },
};

describe("importExcalidraw", () => {
  it("converts shapes, labels, text, groups, bound arrows, lines, and images", () => {
    const { scene, assets, warnings } = importExcalidraw(doc);
    const e = scene.elements;
    expect(Object.keys(e).sort()).toEqual(["a-note", "c-1", "c-2", "ellipse-1", "group-1", "image-1", "load-balancer"].sort());
    expect(e["load-balancer"]).toMatchObject({ type: "rectangle", x: 100, y: 100, width: 200, height: 80, label: { text: "Load balancer" }, parentId: "group-1", style: { fill: "accent-soft", fontSize: 25 } });
    expect(e["ellipse-1"]).toMatchObject({ type: "ellipse", parentId: "group-1", style: { stroke: "danger" } });
    const arrow = Object.values(e).find((x) => x.type === "connector" && x.style.strokeStyle === "dashed")!;
    expect(arrow).toMatchObject({ start: { kind: "bound", elementId: "load-balancer" }, endHead: "arrow" });
    const line = Object.values(e).find((x) => x.type === "connector" && x !== arrow)!;
    expect(line).toMatchObject({ start: { kind: "free", x: 100, y: 400 }, end: { kind: "free", x: 400, y: 400 }, endHead: "none", waypoints: [{ x: 250, y: 450 }] });
    expect(e["a-note"]).toMatchObject({ type: "text", content: { text: "A note" } });
    expect(e["image-1"]).toMatchObject({ type: "image", fit: "fill" });
    expect(assets.size).toBe(1);
    expect(warnings).toEqual(["'freedraw' elements do not convert (element 'F1')."]);
    expect(scene.settings.style).toBe("sketch");
    expect(scene.settings.camera).toBeDefined();
    expect(resolveTimeline(scene).steps).toHaveLength(0);
  });

  it("is deterministic", () => {
    expect(importExcalidraw(doc).scene).toEqual(importExcalidraw(doc).scene);
  });

  it("rejects a file that is not Excalidraw", () => {
    expect(() => importExcalidraw({ foo: 1 })).toThrow(ImportError);
  });
});
