import type { Action, ConnectorElement, Element, Scene } from "@anivo/schema";

/**
 * Print a scene as Anivo Script (docs/09). `compile(print(scene))` gives the
 * same scene, except for draw-order keys and sketch seeds, which the operation
 * bus makes again. Positions are absolute (at=), so the layout stays the same.
 */
export function printScene(scene: Scene): string {
  const out: string[] = [];
  const s = scene.settings;
  const head = [`scene ${q(scene.meta.title)}`, `style=${s.style}`, `theme=${s.theme}`, `size=${s.video.width}x${s.video.height}`, `fps=${s.video.fps}`];
  if (s.background.kind !== "solid") head.push(`background=${s.background.kind}`);
  out.push(head.join(" "), "");

  const sorted = Object.values(scene.elements).sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : a.id < b.id ? -1 : 1));
  const childrenOf = (id: string) => sorted.filter((e) => e.parentId === id);
  const printed = new Set<string>();

  const printElement = (el: Element, indent: string) => {
    if (printed.has(el.id)) return;
    printed.add(el.id);
    if (el.type === "connector") {
      out.push(indent + printConnector(el));
      return;
    }
    if (el.type === "group") {
      out.push(`${indent}group ${el.id}`);
      for (const c of childrenOf(el.id)) printElement(c, `${indent}  `);
      return;
    }
    const parts: string[] = [];
    const kind = el.type === "rectangle" ? "box" : el.type;
    parts.push(kind, el.id);
    if (el.type === "icon") parts.push(`${el.pack}:${el.name}`);
    if (el.type === "text") parts.push(q(el.content.text));
    else if (el.label) parts.push(q(el.label.text));
    parts.push(`at=${n(el.x)},${n(el.y)}`, `size=${n(el.width)}x${n(el.height)}`);
    parts.push(...styleParts(el));
    if (el.opacity !== 1) parts.push(`opacity=${n(el.opacity)}`);
    if (el.rotation !== 0) parts.push(`rotate=${n(el.rotation)}`);
    out.push(indent + parts.join(" "));
  };

  for (const el of sorted) {
    if (el.parentId && scene.elements[el.parentId]) {
      // Print the top group of this element at the position of its first element.
      let top = scene.elements[el.parentId]!;
      while (top.parentId && scene.elements[top.parentId]) top = scene.elements[top.parentId]!;
      printElement(top, "");
    } else printElement(el, "");
  }


  let actionIndex = 0;
  for (const step of scene.steps) {
    out.push("");
    const parts = [`step ${q(step.title)}`, `id=${step.id}`];
    if (step.holdMs !== 500) parts.push(`hold=${step.holdMs}ms`);
    if (step.durationMs !== undefined) parts.push(`dur=${step.durationMs}ms`);
    if (step.trigger.kind === "click") parts.push("click");
    if (step.notes) parts.push(`notes=${q(step.notes)}`);
    out.push(parts.join(" "));
    for (const a of step.actions) {
      actionIndex++;
      out.push(`  ${printAction(a, actionIndex)}`);
    }
  }
  return `${out.join("\n")}\n`;
}

/** Quote a string for Anivo Script. */
function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

const n = (v: number) => String(Math.round(v * 100) / 100);

const STYLE_OUT: Record<string, string> = {
  fill: "fill",
  stroke: "stroke",
  strokeWidth: "stroke-width",
  cornerRadius: "radius",
  fontSize: "font-size",
  textColor: "color",
  textAlign: "text-align",
  fontFamily: "font",
  roughness: "roughness",
  fontWeight: "weight",
};

function styleParts(el: Element): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(el.style)) {
    if (v === undefined) continue;
    if (k === "strokeStyle") parts.push(`style=${v}`);
    else if (STYLE_OUT[k]) parts.push(`${STYLE_OUT[k]}=${typeof v === "string" && /\s/.test(v) ? q(v) : String(v)}`);
  }
  return parts;
}

function printConnector(c: ConnectorElement): string {
  const end = (e: ConnectorElement["start"]) => (e.kind === "bound" ? e.elementId : `${n(e.x)},${n(e.y)}`);
  const from = c.start.kind === "bound" ? c.start.elementId : "p";
  const to = c.end.kind === "bound" ? c.end.elementId : "p";
  const parts = ["arrow", end(c.start), "->", end(c.end)];
  if (c.label) parts.push(q(c.label.text));
  if (c.id !== `c-${from}-${to}`.slice(0, 48)) parts.push(`id=${c.id}`);
  if (c.route !== "straight") parts.push(c.route);
  if (c.endHead !== "arrow") parts.push(`head=${c.endHead}`);
  if (c.startHead !== "none") parts.push(`start-head=${c.startHead}`);
  for (const [k, v] of Object.entries(c.style)) {
    if (k === "strokeStyle") parts.push(`style=${v}`);
    else if (k === "strokeWidth") parts.push(`width=${v}`);
    else if (STYLE_OUT[k]) parts.push(`${STYLE_OUT[k]}=${v}`);
  }
  if (c.opacity !== 1) parts.push(`opacity=${n(c.opacity)}`);
  return parts.join(" ");
}

const MORPH_OUT: Record<string, string> = { x: "x", y: "y", width: "width", height: "height", fill: "fill", stroke: "stroke", strokeWidth: "stroke-width", cornerRadius: "radius", opacity: "opacity", fontSize: "font-size", textColor: "color", label: "label", rotation: "rotate" };

function printAction(a: Action, index: number): string {
  const parts: string[] = [];
  const common = () => {
    if (a.delayMs) parts.push(`+${a.delayMs}ms`);
    if (a.durationMs !== undefined) parts.push(`dur=${a.durationMs}ms`);
    if (a.staggerMs) parts.push(`stagger=${a.staggerMs}ms`);
    if (typeof a.easing === "string") parts.push(`easing=${a.easing}`);
    if (a.id !== `a${index}`) parts.push(`id=${a.id}`);
  };
  if (a.type === "wait") {
    parts.push("wait", `${a.durationMs ?? 1000}ms`);
    if (a.delayMs) parts.push(`+${a.delayMs}ms`);
    if (a.id !== `a${index}`) parts.push(`id=${a.id}`);
    return parts.join(" ");
  }
  const targets = a.targets.join(", ");
  if (a.type === "camera") {
    parts.push("camera", a.camera.op);
    if (a.camera.op === "zoom-to") parts.push(targets);
    if (a.camera.op === "pan" && a.camera.rect) parts.push(`at=${n(a.camera.rect.x)},${n(a.camera.rect.y)}`, `size=${n(a.camera.rect.width)}x${n(a.camera.rect.height)}`);
    if (a.camera.padding !== 80) parts.push(`padding=${a.camera.padding}`);
    common();
    return parts.join(" ");
  }
  if (a.type === "counter") {
    parts.push("count", targets, `from=${a.counter.from}`, `to=${a.counter.to}`);
    if (a.counter.format !== "{n}") parts.push(`format=${q(a.counter.format)}`);
    if (a.counter.decimals) parts.push(`decimals=${a.counter.decimals}`);
    common();
    return parts.join(" ");
  }
  if (a.type === "enter" || a.type === "exit") {
    parts.push(a.type, targets, a.effect);
    common();
    if (a.params.direction) parts.push(`direction=${a.params.direction}`);
    if (a.params.distance !== undefined) parts.push(`distance=${a.params.distance}`);
    if (a.params.fromScale !== undefined) parts.push(`scale=${a.params.fromScale}`);
  } else if (a.type === "morph") {
    parts.push("morph", targets);
    for (const [k, v] of Object.entries(a.to)) if (v !== undefined) parts.push(`${MORPH_OUT[k] ?? k}=${typeof v === "string" ? q(v) : n(v)}`);
    common();
  } else if (a.type === "flow") {
    parts.push("flow", targets);
    const f = a.flow;
    if (f.distribute !== "all") parts.push(f.distribute === "random-seeded" ? "random" : f.distribute);
    if (f.direction !== "forward") parts.push(f.direction);
    if (f.rate !== 2) parts.push(`rate=${f.rate}`);
    if (f.speed !== 400) parts.push(`speed=${f.speed}`);
    if (f.size !== 8) parts.push(`size=${f.size}`);
    if (f.color !== "accent") parts.push(`color=${f.color}`);
    if (f.shape !== "dot") parts.push(`shape=${f.shape}`);
    if (f.trail) parts.push(`trail=${f.trail}`);
    if (f.chainFrom) parts.push(`chain=${f.chainFrom}`);
    if (f.skip.length) parts.push(`skip=${f.skip.join(",")}`);
    common();
  } else {
    parts.push(a.effect, targets);
    common();
    const p = a.params;
    if (p.count !== undefined) parts.push(`count=${p.count}`);
    if (p.scale !== undefined) parts.push(`scale=${p.scale}`);
    if (p.color) parts.push(`color=${p.color}`);
    if (p.dimTo !== undefined) parts.push(`dim=${p.dimTo}`);
    if (p.amplitude !== undefined) parts.push(`amplitude=${p.amplitude}`);
    if (p.degrees !== undefined) parts.push(`degrees=${p.degrees}`);
  }
  return parts.join(" ");
}
