/**
 * Frame time benchmark (docs/12 "Performance budgets").
 * Run: pnpm bench
 * Scene: 300 elements (150 shapes, 100 connectors, 50 icons), 1920 x 1080.
 */
import { evaluate, resolveTimeline } from "../packages/engine/src/index.js";
import { registerBundledAssets } from "../packages/export-node/src/index.js";
import { evaluateWithLayout } from "../packages/layout/src/index.js";
import { type Ctx2D, renderFrame } from "../packages/render/src/index.js";
import { loadScene } from "../packages/schema/src/index.js";
import { createCanvas } from "@napi-rs/canvas";

registerBundledAssets();
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
if (!r.ok) throw new Error(JSON.stringify(r.issues.slice(0, 3)));
const scene = r.scene;
const total = resolveTimeline(scene).totalMs;
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext("2d") as unknown as Ctx2D;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function bench(name: string, fn: (t: number) => void, n = 120): number {
  for (let i = 0; i < 10; i++) fn((i / 10) * total); // warm up the caches
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn((i / n) * total);
    times.push(performance.now() - t0);
  }
  const m = median(times);
  console.log(`${name.padEnd(36)} median ${m.toFixed(2)} ms`);
  return m;
}

bench("evaluate (300 elements)", (t) => void evaluate(scene, t));
bench("evaluate + layout", (t) => void evaluateWithLayout(scene, t));
const fixed = evaluateWithLayout(scene, total / 2);
bench("render only (clean)", () => renderFrame(ctx, scene, fixed.frame, fixed.routes, { width: 1920, height: 1080, style: "clean" }));
bench("render only, no labels (clean)", () => renderFrame(ctx, { ...scene, elements: Object.fromEntries(Object.entries(scene.elements).map(([k, e]) => [k, { ...e, label: undefined }])) }, { ...fixed.frame, elements: fixed.frame.elements.map((f) => ({ ...f, label: undefined })) }, fixed.routes, { width: 1920, height: 1080, style: "clean" }));
for (const style of ["clean", "sketch"] as const) {
  bench(`evaluate + layout + render (${style})`, (t) => {
    const { frame, routes } = evaluateWithLayout(scene, t);
    renderFrame(ctx, scene, frame, routes, { width: 1920, height: 1080, style });
  });
}
