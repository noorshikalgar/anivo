/**
 * Build the built-in templates in assets/templates with the operation bus.
 * The templates use only operations that the editor UI also sends, so each
 * template proves that a person can make the example in the editor
 * (docs/13, phase 1 exit gate: Examples A, C, and D).
 *
 * Run: pnpm build:templates
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { importMermaid } from "@anivo/import";
import { lintScene } from "@anivo/lint";
import { applyScript } from "@anivo/script";
import { sceneToJson } from "@anivo/fileio";
import { OperationBus, type OperationInput } from "@anivo/ops";
import { type Scene, TEMPLATES, loadScene } from "@anivo/schema";

function build(title: string, ops: OperationInput[], steps: { title: string; holdMs?: number; actions: Record<string, unknown>[] }[]): Scene {
  const r = loadScene({ schemaVersion: 1, meta: { title }, settings: { style: "clean", theme: "studio-dark", background: { kind: "gradient" } } });
  if (!r.ok) throw new Error("empty scene");
  const bus = new OperationBus(r.scene);
  const apply = (tx: OperationInput[]) => {
    const res = bus.apply({ ops: tx });
    if (!res.ok) throw new Error(`${title}: ${res.error.message} at ${res.error.path}`);
    return res;
  };
  apply(ops);
  steps.forEach((s, i) => apply([{ op: "step.add", id: `s${i + 1}`, props: { title: s.title, ...(s.holdMs !== undefined ? { holdMs: s.holdMs } : {}), actions: s.actions } }]));
  return bus.scene;
}

const box = (id: string, label: string, x: number, y: number, w: number, h: number, style: Record<string, unknown> = {}): OperationInput => ({
  op: "element.add",
  id,
  type: "rectangle",
  props: { label, x, y, width: w, height: h, style },
});
const text = (id: string, content: string, x: number, y: number, w: number, h: number, style: Record<string, unknown> = {}): OperationInput => ({
  op: "element.add",
  id,
  type: "text",
  props: { content, x, y, width: w, height: h, style },
});
const connect = (from: string, to: string, props: Record<string, unknown> = {}): OperationInput => ({ op: "element.connect", id: `c-${from}-${to}`.slice(0, 48), from, to, props });
const freeArrow = (id: string, x1: number, y1: number, x2: number, y2: number, props: Record<string, unknown> = {}): OperationInput => ({
  op: "element.add",
  id,
  type: "connector",
  props: { start: { kind: "free", x: x1, y: y1 }, end: { kind: "free", x: x2, y: y2 }, ...props },
});

// --- Example A: how a load balancer works ---------------------------------------
const pods = ["pod-1", "pod-2", "pod-3"];
const loadBalancer = build(
  "How a load balancer works",
  [
    { op: "element.add", id: "user", type: "icon", props: { pack: "lucide", name: "user", label: "User", x: 120, y: 480, width: 120, height: 120 } },
    box("lb", "Load balancer", 600, 490, 260, 100, { fill: "accent-soft" }),
    ...pods.map((id, i) => box(id, id, 1200, 240 + i * 255, 220, 90)),
    connect("user", "lb"),
    connect("lb", "pod-1"),
    connect("lb", "pod-2"),
    connect("lb", "pod-3"),
    text("caption", "Kubernetes replaces the failed pod", 460, 930, 1000, 70, { fontSize: 40, textColor: "muted" }),
  ],
  [
    { title: "User appears", actions: [{ type: "enter", effect: "draw-on", targets: ["user"] }] },
    {
      title: "Load balancer",
      actions: [
        { type: "enter", effect: "pop", targets: ["lb"] },
        { type: "enter", effect: "draw-on", targets: ["c-user-lb"], delayMs: 300, durationMs: 600 },
      ],
    },
    {
      title: "Pods fan out",
      actions: [
        { type: "enter", effect: "draw-on", targets: ["c-lb-pod-1", "c-lb-pod-2", "c-lb-pod-3"], durationMs: 600 },
        { type: "enter", effect: "pop", targets: pods, delayMs: 400, staggerMs: 150 },
      ],
    },
    {
      title: "Traffic flows",
      holdMs: 0,
      actions: [
        { type: "flow", targets: ["c-user-lb"], durationMs: 3000, flow: { rate: 3 } },
        { type: "flow", targets: ["c-lb-pod-1", "c-lb-pod-2", "c-lb-pod-3"], durationMs: 3000, flow: { rate: 3, distribute: "round-robin", chainFrom: "c-user-lb" } },
      ],
    },
    {
      title: "Pod 3 crashes",
      holdMs: 0,
      actions: [
        { type: "morph", targets: ["pod-3"], to: { fill: "danger-soft", stroke: "danger", label: "pod-3 crashed" }, durationMs: 400 },
        { type: "emphasis", effect: "shake", targets: ["pod-3"], delayMs: 200 },
        { type: "flow", targets: ["c-user-lb"], durationMs: 3000, flow: { rate: 3 } },
        { type: "flow", targets: ["c-lb-pod-1", "c-lb-pod-2", "c-lb-pod-3"], durationMs: 3000, flow: { rate: 3, distribute: "round-robin", chainFrom: "c-user-lb", skip: ["c-lb-pod-3"], color: "accent" } },
      ],
    },
    {
      title: "Self-healing",
      holdMs: 1500,
      actions: [
        { type: "exit", effect: "fade", targets: ["c-lb-pod-3"], durationMs: 300 },
        { type: "morph", targets: ["pod-3"], to: { fill: "success-soft", stroke: "success", label: "pod-3 (new)" }, delayMs: 300, durationMs: 600 },
        { type: "enter", effect: "draw-on", targets: ["c-lb-pod-3"], delayMs: 900, durationMs: 500 },
        { type: "emphasis", effect: "pulse", targets: ["pod-3"], delayMs: 900 },
        { type: "enter", effect: "fade", targets: ["caption"], delayMs: 600 },
      ],
    },
  ],
);

// --- Example C: TCP three-way handshake -------------------------------------------
const tcp = build(
  "TCP three-way handshake",
  [
    box("client", "Client", 200, 160, 280, 110),
    box("server", "Server", 1440, 160, 280, 110),
    freeArrow("client-time", 340, 300, 340, 980, { endHead: "none", style: { strokeStyle: "dashed", stroke: "muted" } }),
    freeArrow("server-time", 1580, 300, 1580, 980, { endHead: "none", style: { strokeStyle: "dashed", stroke: "muted" } }),
    freeArrow("syn", 352, 400, 1568, 500, { label: "SYN", style: { stroke: "accent", strokeWidth: 3 } }),
    freeArrow("syn-ack", 1568, 580, 352, 680, { label: "SYN-ACK", style: { stroke: "purple", strokeWidth: 3 } }),
    freeArrow("ack", 352, 760, 1568, 860, { label: "ACK", style: { stroke: "accent", strokeWidth: 3 } }),
    text("connected", "Connected", 760, 930, 400, 80, { fontSize: 48, textColor: "success", fontWeight: 700 }),
  ],
  [
    {
      title: "Client and server",
      actions: [
        { type: "enter", effect: "pop", targets: ["client", "server"], staggerMs: 150 },
        { type: "enter", effect: "draw-on", targets: ["client-time", "server-time"], delayMs: 400, durationMs: 900 },
      ],
    },
    { title: "SYN", actions: [{ type: "enter", effect: "draw-on", targets: ["syn"], durationMs: 1000 }] },
    { title: "SYN-ACK", actions: [{ type: "enter", effect: "draw-on", targets: ["syn-ack"], durationMs: 1000 }] },
    {
      title: "ACK: connected",
      holdMs: 1500,
      actions: [
        { type: "enter", effect: "draw-on", targets: ["ack"], durationMs: 1000 },
        { type: "morph", targets: ["client", "server"], to: { fill: "success-soft", stroke: "success" }, delayMs: 900 },
        { type: "enter", effect: "pop", targets: ["connected"], delayMs: 1100 },
      ],
    },
  ],
);

// --- Example D: Docker image layers -------------------------------------------------
const layers: [string, string, number][] = [
  ["base", "Base OS", 700],
  ["deps", "Dependencies", 560],
  ["code", "App code", 420],
];
const docker = build(
  "Docker image layers",
  [
    text("title", "Docker image", 660, 110, 600, 60, { fontSize: 44, fontWeight: 700 }),
    box("image", "", 660, 180, 600, 680, { strokeStyle: "dashed", fill: "transparent", stroke: "muted" }),
    ...layers.map(([id, label, y]) => box(id, label, 700, y, 520, 120, { fill: "surface-strong" })),
    box("code-v2", "App code v2", 700, 420, 520, 120, { fill: "accent-soft", stroke: "accent" }),
    text("cached", "Cached layers reused. Only the top layer rebuilds.", 360, 920, 1200, 70, { fontSize: 38, textColor: "muted" }),
  ],
  [
    {
      title: "An empty image",
      actions: [
        { type: "enter", effect: "draw-on", targets: ["image"] },
        { type: "enter", effect: "fade", targets: ["title"], delayMs: 200 },
      ],
    },
    {
      title: "Layers stack up",
      actions: [{ type: "enter", effect: "slide", targets: ["base", "deps", "code"], params: { direction: "down", distance: 220 }, durationMs: 600, staggerMs: 450 }],
    },
    {
      title: "Code changes",
      holdMs: 1500,
      actions: [
        { type: "emphasis", effect: "flash", targets: ["code"], params: { color: "warning" }, durationMs: 600 },
        { type: "exit", effect: "fade", targets: ["code"], delayMs: 600, durationMs: 300 },
        { type: "enter", effect: "pop", targets: ["code-v2"], delayMs: 800 },
        { type: "emphasis", effect: "glow", targets: ["base", "deps"], params: { color: "success" }, delayMs: 1100, durationMs: 1200 },
        { type: "enter", effect: "fade", targets: ["cached"], delayMs: 1200 },
      ],
    },
  ],
);

// Templates written in Anivo Script (scripts/templates/<name>.anivo.txt) or Mermaid (<name>.mmd).
function fromSource(name: string): Scene {
  const txt = `scripts/templates/${name}.anivo.txt`;
  if (existsSync(txt)) {
    const r = applyScript(readFileSync(txt, "utf8"), { author: { kind: "system" } });
    if (!r.ok) throw new Error(`${txt}: ${r.errors.map((e) => `${e.line}:${e.col} ${e.message}`).join("; ")}`);
    return r.scene;
  }
  const mmd = `scripts/templates/${name}.mmd`;
  const t = TEMPLATES.find((x) => x.name === name)!;
  const scene = importMermaid(readFileSync(mmd, "utf8"), { title: t.title }).scene;
  // (Only used when there is no .anivo.txt for the template.)
  // The built-in templates use the Studio look (docs/27).
  return { ...scene, settings: { ...scene.settings, theme: "studio-dark", background: { ...scene.settings.background, kind: "gradient" } } };
}

// load-balancer: scripts/templates/load-balancer.anivo.txt (docs/27). The editor tests use a frozen copy of the first version (packages/schema/fixtures).
// tcp-handshake and docker-layers: scripts/templates too.
void loadBalancer;
void tcp;
void docker;
const built: Record<string, Scene> = {};
const out: [string, Scene][] = TEMPLATES.map((t) => [t.name, built[t.name] ?? fromSource(t.name)]);
for (const [name, scene] of out) {
  const errors = lintScene(scene).filter((l) => l.level === "error");
  if (errors.length) throw new Error(`Template '${name}' has lint errors: ${errors.map((e) => e.message).join("; ")}`);
  writeFileSync(`assets/templates/${name}.anivo.json`, sceneToJson(scene));
  console.log(`assets/templates/${name}.anivo.json: ${Object.keys(scene.elements).length} elements, ${scene.steps.length} steps`);
}
