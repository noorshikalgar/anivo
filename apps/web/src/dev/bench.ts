import { evaluateWithLayout } from "@anivo/layout";
import { type Ctx2D, renderFrame } from "@anivo/render";
import { loadScene } from "@anivo/schema";
import { resolveTimeline } from "@anivo/engine";

/**
 * Development benchmark (docs/12 "Performance budgets"): the same 300-element
 * scene as scripts/bench.ts, drawn on a 1920 x 1080 canvas in this browser.
 */
export function benchFrames(style: "clean" | "sketch", frames = 120): { median: number; p90: number } {
  const elements: Record<string, unknown> = {};
  let z = 0;
  const key = () => `a${String(z++).padStart(4, "0")}`;
  for (let i = 0; i < 150; i++) elements[`s${i}`] = { type: i % 3 === 0 ? "ellipse" : "rectangle", z: key(), x: (i % 15) * 125 + 20, y: Math.floor(i / 15) * 100 + 20, width: 100, height: 60, label: { text: `n${i}` } };
  for (let i = 0; i < 100; i++) elements[`c${i}`] = { type: "connector", z: key(), start: { kind: "bound", elementId: `s${i}` }, end: { kind: "bound", elementId: `s${i + 15}` } };
  for (let i = 0; i < 50; i++) elements[`i${i}`] = { type: "icon", z: key(), pack: "lucide", name: "server", x: (i % 10) * 190 + 40, y: 1000 - Math.floor(i / 10) * 70, width: 48, height: 48 };
  const steps = [
    { id: "s-a", actions: [{ id: "x1", type: "emphasis", effect: "pulse", targets: ["s1", "s2", "s3"], durationMs: 2000 }] },
    { id: "s-b", actions: [{ id: "x2", type: "flow", targets: Array.from({ length: 20 }, (_, i) => `c${i}`), durationMs: 2000, flow: { rate: 4 } }] },
  ];
  const r = loadScene({ schemaVersion: 1, elements, steps });
  if (!r.ok) throw new Error("bench scene");
  const scene = r.scene;
  const total = resolveTimeline(scene).totalMs;
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d") as unknown as Ctx2D;
  const times: number[] = [];
  for (let i = 0; i < frames + 10; i++) {
    const t0 = performance.now();
    const { frame, routes } = evaluateWithLayout(scene, ((i % frames) / frames) * total);
    renderFrame(ctx, scene, frame, routes, { width: 1920, height: 1080, style });
    // Force the browser to finish the drawing work for this frame.
    (ctx as unknown as CanvasRenderingContext2D).getImageData(0, 0, 1, 1);
    if (i >= 10) times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)]!, p90: times[Math.floor(times.length * 0.9)]! };
}
