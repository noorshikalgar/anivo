import { describe, expect, it } from "vitest";
import { applyScript } from "./apply.js";
import { compile } from "./compile.js";
import { printScene } from "./print.js";

const EXAMPLE_A = `
scene "How a load balancer works" style=clean theme=slate-dark size=1920x1080 fps=60

icon user lucide:user "User"
box lb "Load balancer" fill=accent-soft right-of=user gap=240
column pods right-of=lb gap=240 spacing=60
  box pod-1 "pod-1"
  box pod-2 "pod-2"
  box pod-3 "pod-3"

arrow user -> lb
arrow lb -> pod-1, pod-2, pod-3

step "User appears"
  enter user draw-on
step "Load balancer"
  enter lb pop
  enter user->lb draw-on +300ms
step "Pods fan out"
  enter lb->pod-* draw-on
  enter pod-* pop +400ms stagger=150ms
step "Traffic flows" hold=3s
  flow user->lb rate=2
  flow lb->pod-* round-robin chain=user->lb
step "Pod 3 crashes"
  morph pod-3 fill=danger label="pod-3 crashed"
  shake pod-3
  flow lb->pod-* round-robin skip=lb->pod-3
step "Self-healing"
  morph pod-3 fill=surface label="pod-3 (new)"
  caption note "Replaced automatically"
`;

function ok(text: string) {
  const r = applyScript(text);
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.line}:${e.col} ${e.message} ${e.hint ?? ""}`).join("\n"));
  return r.scene;
}

describe("Anivo Script", () => {
  it("compiles the docs/09 Example A except the caption inside a step", () => {
    const r = applyScript(EXAMPLE_A);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toContain("caption");
  });

  it("compiles Example A with the caption declared at top level", () => {
    const text = EXAMPLE_A.replace('  caption note "Replaced automatically"\n', '  enter note fade\n') + 'caption note "Replaced automatically"\n';
    const scene = ok(text);
    expect(scene.meta.title).toBe("How a load balancer works");
    expect(Object.keys(scene.elements).sort()).toEqual(["c-lb-pod-1", "c-lb-pod-2", "c-lb-pod-3", "c-user-lb", "lb", "note", "pod-1", "pod-2", "pod-3", "pods", "user"].sort());
    expect(scene.elements["pods"]?.type).toBe("group");
    expect(scene.elements["pod-2"]?.parentId).toBe("pods");
    expect(scene.steps).toHaveLength(6);
    const traffic = scene.steps[3]!;
    expect(traffic.holdMs).toBe(3000);
    expect(traffic.actions[1]).toMatchObject({ type: "flow", targets: ["c-lb-pod-1", "c-lb-pod-2", "c-lb-pod-3"], flow: { distribute: "round-robin", chainFrom: "c-user-lb" } });
    const crash = scene.steps[4]!;
    expect(crash.actions[0]).toMatchObject({ type: "morph", targets: ["pod-3"], to: { fill: "danger", label: "pod-3 crashed" } });
    expect(crash.actions[2]).toMatchObject({ type: "flow", flow: { skip: ["c-lb-pod-3"] } });
    expect(scene.steps[2]!.actions[1]).toMatchObject({ type: "enter", effect: "pop", delayMs: 400, staggerMs: 150, targets: ["pod-1", "pod-2", "pod-3"] });
  });

  it("places elements with relations and centers the diagram in the camera", () => {
    const scene = ok(`box a "A"\nbox b "B" right-of=a gap=100\nbox c "C" below=a gap=50\n`);
    const { a, b, c } = scene.elements as Record<string, { x: number; y: number; width: number; height: number }>;
    expect(b!.x - (a!.x + a!.width)).toBe(100);
    expect(b!.y).toBe(a!.y);
    expect(c!.y - (a!.y + a!.height)).toBe(50);
    const minX = a!.x;
    const maxX = b!.x + b!.width;
    expect(Math.round((minX + maxX) / 2)).toBe(960);
  });

  it("keeps absolute positions and does not center", () => {
    const scene = ok(`box a "A" at=100,200 size=300x80\n`);
    expect(scene.elements["a"]).toMatchObject({ x: 100, y: 200, width: 300, height: 80 });
  });

  it("supports free arrow ends, labels, and flags", () => {
    const scene = ok(`box a "A" at=0,0\narrow a -> 500,300 "go" dashed curved id=go\narrow 10,10 -> a no-head\n`);
    expect(scene.elements["go"]).toMatchObject({ type: "connector", route: "curved", label: { text: "go" }, style: { strokeStyle: "dashed" }, end: { kind: "free", x: 500, y: 300 } });
    expect(scene.elements["c-p-a"]).toMatchObject({ endHead: "none", start: { kind: "free", x: 10, y: 10 } });
  });

  it("reports errors with a line, a column, and a hint, and reports more than one", () => {
    const r = compile(`box a "A"\nbox a "again"\nbix c\n  box d\n`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(r.errors[0]).toMatchObject({ col: 5, message: "The ID 'a' is used two times." });
    expect(r.errors[1]?.message).toContain("'bix' is not known");
  });

  it("reports an unknown target in a step", () => {
    const r = compile(`box a "A"\nstep "One"\n  enter b pop\n`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ line: 3, message: "The element 'b' does not exist.", hint: "Use one of: a." });
  });

  it("appends to a base scene and uses its connectors", () => {
    const base = ok(`box a "A"\nbox b "B" right-of=a\narrow a -> b\n`);
    const r = applyScript(`box c "C" below=b\nstep "Flow"\n  flow a->b rate=1\n`, { mode: "append", base });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.scene.elements["c"]!.y).toBeGreaterThan(base.elements["b"]!.y);
    expect(r.scene.steps[0]!.actions[0]).toMatchObject({ targets: ["c-a-b"] });
  });

  it("places elements with a layout statement", () => {
    const scene = ok(`box web "Web"\nbox api "API"\nbox db "DB"\nbox cache "Cache"\narrow web -> api\narrow api -> db, cache\nlayout web, api, db, cache layered gap=120\n`);
    const e = scene.elements as Record<string, { x: number; y: number }>;
    expect(e["web"]!.x).toBeLessThan(e["api"]!.x);
    expect(e["db"]!.x).toBe(e["cache"]!.x);
    const bad = compile(`box a "A"\nlayout a, b row\n`);
    expect(bad.ok).toBe(false);
  });

  it("morphs a shape into another shape", () => {
    const scene = ok(`box a "A" at=100,100\nstep "S"\n  morph a shape=ellipse\n`);
    expect(scene.steps[0]!.actions[0]).toMatchObject({ type: "morph", to: { shape: "ellipse" } });
    expect(printScene(scene)).toContain('morph a shape="ellipse"');
  });

  it("supports a motion path and prints it back", () => {
    const text = `box a "A" at=100,100\nstep "Go"\n  move a path="150,150 600,150 600,500" curve orient dur=2s\n`;
    const scene = ok(text);
    expect(scene.steps[0]!.actions[0]).toMatchObject({ type: "motion", durationMs: 2000, motion: { curve: true, orient: true, points: [{ x: 150, y: 150 }, { x: 600, y: 150 }, { x: 600, y: 500 }] } });
    expect(printScene(scene)).toContain('move a path="150,150 600,150 600,500" curve orient dur=2000ms');
    const bad = applyScript(`box a "A"\nstep "Go"\n  move a path="1,1"\n`);
    expect(!bad.ok && bad.errors[0]!.message).toBe("The path needs 2 or more points.");
  });

  it("supports icon particles, one particle, orient, and a trail, and prints them back", () => {
    const text = `box a "A" at=100,100\nbox b "B" at=600,100\narrow a -> b\nstep "S"\n  flow a->b icon=lucide:mail size=32 once orient trail=0.5 color=success\n`;
    const scene = ok(text);
    expect(scene.steps[0]!.actions[0]).toMatchObject({ type: "flow", flow: { shape: "icon", icon: "lucide:mail", size: 32, count: 1, orient: true, trail: 0.5, color: "success" } });
    expect(printScene(scene)).toContain("flow c-a-b size=32 color=success icon=lucide:mail trail=0.5 once orient");
    const again = ok(printScene(scene).replace(/^scene.*\n/, ""));
    expect(again.steps[0]!.actions[0]).toMatchObject({ flow: { shape: "icon", count: 1, orient: true } });
  });

  it("supports own settings for the particles that go back", () => {
    const scene = ok(`box a "A" at=100,100\nbox b "B" at=600,100\narrow a -> b\nstep "S"\n  flow a->b color=accent back-icon=lucide:check back-color=success back-once back-delay=500ms\n`);
    expect(scene.steps[0]!.actions[0]).toMatchObject({ flow: { direction: "both", back: { shape: "icon", icon: "lucide:check", color: "success", count: 1, delayMs: 500 } } });
    const printed = printScene(scene);
    expect(printed).toContain("back-icon=lucide:check back-color=success back-count=1 back-delay=500ms");
    expect(ok(printed.replace(/^scene.*\n/, "")).steps[0]!.actions[0]).toMatchObject({ flow: { back: { icon: "lucide:check", count: 1 } } });
  });

  it("supports shadows, gradients, and icon badges", () => {
    const scene = ok(`box a "A" at=100,100 fill=accent-soft gradient=teal shadow=hard shadow-color=line\nicon u lucide:user "U" at=600,100 fill=accent\nstep "S"\n  enter a, u pop\n`);
    expect(scene.elements["a"]!.style).toMatchObject({ gradient: "teal", shadow: "hard", shadowColor: "line" });
    expect(printScene(scene)).toContain("gradient=teal");
    expect(printScene(scene)).toContain("shadow=hard shadow-color=line");
  });

  it("inserts widgets, and arrows and steps can use them", () => {
    const scene = ok(`widget web browser at=100,100 url="https://anivo.dev"\nwidget kpi stat at=1000,100 size=400x240 value="42 ms" caption="p95"\narrow web -> kpi\nstep "S"\n  enter web, kpi pop\n  pulse kpi-value\n`);
    expect(scene.elements["web"]!.type).toBe("group");
    expect(scene.elements["web-url"]!.label?.text).toBe("https://anivo.dev");
    const v = scene.elements["kpi-value"]!;
    expect(v.type === "text" && v.content.text).toBe("42 ms");
    expect(Object.values(scene.elements).some((e) => e.type === "connector")).toBe(true);
    const bad = applyScript(`widget x nope\n`);
    expect(!bad.ok && bad.errors[0]!.message).toBe("The widget 'nope' is not known.");
  });

  it("supports a step transition", () => {
    const scene = ok(`box a "A" at=100,100\nstep "One"\n  enter a fade\nstep "Two" transition=dip transition-dur=800ms\n  pulse a\n`);
    expect(scene.steps[1]!.transition).toEqual({ kind: "dip", durationMs: 800 });
    expect(printScene(scene)).toContain('transition=dip transition-dur=800ms');
  });

  it("supports a sound on an action and prints it back", () => {
    const text = `box a "A" at=100,100\nstep "S"\n  enter a pop sound=pop sound-gain=-10\n`;
    const scene = ok(text);
    expect(scene.steps[0]!.actions[0]).toMatchObject({ sound: "pop", soundGainDb: -10 });
    expect(printScene(scene)).toContain("enter a pop sound=pop sound-gain=-10");
  });

  it("supports camera and count actions and prints them back", () => {
    const text = `box a "A" at=100,100\ntext rps "0 req/s" at=600,100\nstep "Zoom"\n  camera zoom-to a padding=40 dur=800ms\n  count rps from=0 to=1200 format="{n} req/s"\nstep "Back"\n  camera pan at=0,0 size=960x540\n  camera reset +500ms\n`;
    const scene = ok(text);
    expect(scene.steps[0]!.actions[0]).toMatchObject({ type: "camera", targets: ["a"], camera: { op: "zoom-to", padding: 40 }, durationMs: 800 });
    expect(scene.steps[0]!.actions[1]).toMatchObject({ type: "counter", targets: ["rps"], counter: { from: 0, to: 1200, format: "{n} req/s" } });
    expect(scene.steps[1]!.actions[0]).toMatchObject({ camera: { op: "pan", rect: { x: 0, y: 0, width: 960, height: 540 } } });
    const again = ok(printScene(scene));
    expect(again.steps).toEqual(scene.steps);
  });

  it("supports grid, row, captions, text, wait, click steps, and times", () => {
    const scene = ok(`grid g cols=2 spacing=20\n  box a "A"\n  box b "B"\n  box c "C"\ncaption cap "Hello" top\nstep "S" click hold=1.5s\n  wait 2s\n  pulse a count=3 color=accent +100ms\n`);
    const { a, b, c } = scene.elements as Record<string, { x: number; y: number }>;
    expect(b!.x).toBeGreaterThan(a!.x);
    expect(c!.y).toBeGreaterThan(a!.y);
    expect(scene.elements["cap"]).toMatchObject({ type: "text", y: 60 });
    expect(scene.steps[0]).toMatchObject({ trigger: { kind: "click" }, holdMs: 1500 });
    expect(scene.steps[0]!.actions[0]).toMatchObject({ type: "wait", durationMs: 2000 });
    expect(scene.steps[0]!.actions[1]).toMatchObject({ type: "emphasis", effect: "pulse", delayMs: 100, params: { count: 3, color: "accent" } });
  });
});

describe("move along an arrow", () => {
  it("compiles, follows the arrow route, and prints back", () => {
    const scene = ok(`box a "A" at=0,0\nbox b "B" at=900,0\narrow a -> b\nbox m "M" at=0,400\nstep "Send"\n  move m along=c-a-b back\n`);
    const a = scene.steps[0]!.actions[0]!;
    expect(a).toMatchObject({ type: "motion", durationMs: 1600, motion: { along: "c-a-b", reverse: true } });
    if (a.type !== "motion") throw new Error("motion");
    // A lead-in from the element center, then the route from the arrow end (back).
    expect(a.motion.points[0]!.x).toBeLessThan(200);
    expect(a.motion.points[1]!.x).toBeGreaterThan(500);
    expect(printScene(scene)).toContain("move m along=c-a-b back");
  });
});

describe("step caption", () => {
  it("compiles caption, near, and side, and prints them back", () => {
    const scene = ok(`box a "A" at=100,100\nstep "Hi" caption="Alice says hi" near=a side=below\n  enter a fade\n`);
    expect(scene.steps[0]!.caption).toEqual({ text: "Alice says hi", anchor: "a", side: "below" });
    expect(printScene(scene)).toContain('caption="Alice says hi" near=a side=below');
  });
});
