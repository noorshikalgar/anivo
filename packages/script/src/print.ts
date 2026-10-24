import { type Action, type ConnectorElement, type Element, type Scene, tableCellId } from "@anivo/schema";

/**
 * Print a scene as Anivo Script (docs/09). `compile(print(scene))` gives the
 * same scene, except for draw-order keys and sketch seeds, which the operation
 * bus makes again. Positions are absolute (at=), so the layout stays the same.
 */
export function printScene(scene: Scene): string {
  const out: string[] = [];
  const s = scene.settings;
  const head = [`scene ${q(scene.meta.title)}`, `style=${s.style}`, `theme=${s.theme}`, `size=${s.video.width}x${s.video.height}`, `fps=${s.video.fps}`];
  const bgx = s.background;
  if (bgx.kind !== "solid") {
    head.push(`background=${bgx.kind}`);
    if (bgx.color) head.push(`background-color=${q(bgx.color)}`);
  } else if (bgx.color) head.push(`background=${q(bgx.color)}`);
  if (bgx.color2) head.push(`background2=${q(bgx.color2)}`);
  if (bgx.angle !== undefined) head.push(`angle=${bgx.angle}`);
  if (bgx.vignette) head.push(`vignette=${bgx.vignette}`);
  if (bgx.grain) head.push(`grain=${bgx.grain}`);
  if (bgx.drift) head.push("drift");
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
    if (el.type === "table") {
      const parts = ["table", el.id];
      if (!el.header) parts.push("no-header");
      parts.push(`at=${n(el.x)},${n(el.y)}`, `size=${n(el.width)}x${n(el.height)}`, ...styleParts(el));
      out.push(indent + parts.join(" "));
      for (let r = 1; r <= el.rows; r++) {
        const row: string[] = [];
        for (let c = 1; c <= el.cols; c++) {
          const cell = scene.elements[tableCellId(el.id, r, c)];
          if (cell) printed.add(cell.id);
          row.push(q(cell?.type === "text" ? cell.content.text : ""));
        }
        out.push(`${indent}  ${row.join(" ")}`);
      }
      return;
    }
    const parts: string[] = [];
    const kind = el.type === "rectangle" ? "box" : el.type;
    parts.push(kind, el.id);
    if (el.type === "icon") parts.push(`${el.pack}:${el.name}`);
    if (el.type === "text") parts.push(q(el.content.text));
    else if (el.type === "code") {
      parts.push(q(el.code), `lang=${el.language}`);
      if (!el.lineNumbers) parts.push("no-numbers");
    } else if (el.type === "image") {
      parts.push(`asset=${el.assetId}`);
      if (el.fit !== "contain") parts.push(`fit=${el.fit}`);
    }
    else if (el.label) parts.push(q(el.label.text));
    parts.push(`at=${n(el.x)},${n(el.y)}`, `size=${n(el.width)}x${n(el.height)}`);
    parts.push(...styleParts(el));
    if (el.opacity !== 1) parts.push(`opacity=${n(el.opacity)}`);
    if (el.rotation !== 0) parts.push(`rotate=${n(el.rotation)}`);
    if (el.follow) parts.push(`follow=${el.follow}`);
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
    if (step.caption) parts.push(`caption=${q(step.caption.text)}`, ...(step.caption.anchor ? [`near=${step.caption.anchor}`] : []), ...(step.caption.side !== "auto" ? [`side=${step.caption.side}`] : []));
    if (step.transition) parts.push(`transition=${step.transition.kind}${step.transition.durationMs !== 600 ? ` transition-dur=${step.transition.durationMs}ms` : ""}`);
    if (step.durationMs !== undefined) parts.push(`dur=${step.durationMs}ms`);
    if (step.trigger.kind === "click") parts.push("click");
    if (step.notes) parts.push(`notes=${q(step.notes)}`);
    out.push(parts.join(" "));
    step.actions.forEach((a, i) => {
      actionIndex++;
      out.push(`  ${printAction(a, actionIndex, step.actions[i - 1]?.id)}`);
    });
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
  shadow: "shadow",
  shadowColor: "shadow-color",
  origin: "origin",
  gradient: "gradient",
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

const MORPH_OUT: Record<string, string> = { x: "x", y: "y", width: "width", height: "height", fill: "fill", stroke: "stroke", strokeWidth: "stroke-width", cornerRadius: "radius", opacity: "opacity", fontSize: "font-size", textColor: "color", label: "label", rotation: "rotate", shape: "shape" };

function printAction(a: Action, index: number, prevId?: string): string {
  const parts: string[] = [];
  const common = () => {
    if (a.after) parts.push(`after=${a.after === prevId ? "prev" : a.after}`);
    if (a.delayMs) parts.push(`+${a.delayMs}ms`);
    if (a.durationMs !== undefined) parts.push(`dur=${a.durationMs}ms`);
    if (a.staggerMs) parts.push(`stagger=${a.staggerMs}ms`);
    if (a.staggerOrder && a.staggerOrder !== "in-order") parts.push(`order=${a.staggerOrder}`);
    if (typeof a.easing === "string") parts.push(`easing=${a.easing}`);
    if (a.sound) parts.push(`sound=${a.sound}`);
    if (a.soundGainDb !== undefined) parts.push(`sound-gain=${a.soundGainDb}`);
    if (a.id !== `a${index}`) parts.push(`id=${a.id}`);
  };
  if (a.type === "wait") {
    parts.push("wait", `${a.durationMs ?? 1000}ms`);
    if (a.delayMs) parts.push(`+${a.delayMs}ms`);
    if (a.after) parts.push(`after=${a.after === prevId ? "prev" : a.after}`);
    if (a.id !== `a${index}`) parts.push(`id=${a.id}`);
    return parts.join(" ");
  }
  const targets = a.targets.join(", ");
  if (a.type === "camera") {
    parts.push("camera", a.camera.op);
    if ((a.camera.op === "zoom-to" || a.camera.op === "follow" || a.camera.op === "drift") && a.targets.length) parts.push(targets);
    if (a.camera.op === "drift" && a.camera.zoom !== 1.08) parts.push(`zoom=${a.camera.zoom}`);
    if (a.camera.op === "pan" && a.camera.rect) parts.push(`at=${n(a.camera.rect.x)},${n(a.camera.rect.y)}`, `size=${n(a.camera.rect.width)}x${n(a.camera.rect.height)}`);
    if (a.camera.padding !== 80) parts.push(`padding=${a.camera.padding}`);
    common();
    return parts.join(" ");
  }
  if (a.type === "code") {
    parts.push("code", targets);
    const c = a.code;
    if (c.op === "highlight") parts.push(`highlight=${c.lines ? `${c.lines[0]}-${c.lines[1]}` : "none"}`);
    else if (c.op === "type" && c.lines) parts.push(`type=${c.lines[0]}-${c.lines[1]}`);
    else if (c.op === "diff") parts.push(`diff=${q(c.newCode ?? "")}`);
    common();
    return parts.join(" ");
  }
  if (a.type === "counter") {
    parts.push("count", targets, `from=${a.counter.from}`, `to=${a.counter.to}`);
    if (a.counter.format !== "{n}") parts.push(`format=${q(a.counter.format)}`);
    if (a.counter.decimals) parts.push(`decimals=${a.counter.decimals}`);
    if (a.counter.style && a.counter.style !== "plain") parts.push(`style=${a.counter.style}`);
    if (a.counter.roll) parts.push("roll");
    common();
    return parts.join(" ");
  }
  if (a.type === "enter" || a.type === "exit") {
    parts.push(a.type, targets, a.effect);
    common();
    if (a.params.direction) parts.push(`direction=${a.params.direction}`);
    if (a.params.distance !== undefined) parts.push(`distance=${a.params.distance}`);
    if (a.params.fromScale !== undefined) parts.push(`scale=${a.params.fromScale}`);
    if (a.params.unit === "word") parts.push("unit=word");
  } else if (a.type === "morph") {
    parts.push("morph", targets);
    for (const [k, v] of Object.entries(a.to)) if (v !== undefined) parts.push(`${MORPH_OUT[k] ?? k}=${typeof v === "string" ? q(v) : n(v)}`);
    common();
  } else if (a.type === "mark") {
    const m = a.mark;
    parts.push("mark", targets);
    if (m.phrase) parts.push(q(m.phrase));
    if (m.color) parts.push(`color=${m.color}`);
    if (m.highlight) parts.push(`highlight=${m.highlight}`);
    if (m.underline) parts.push(`underline=${m.underline}`);
    if (m.strike) parts.push(`strike=${m.strike}`);
    if (m.dim) parts.push(`dim=${m.dim}`);
    if (m.clear) parts.push("clear");
    if (m.occurrence !== 1) parts.push(`occurrence=${m.occurrence}`);
    common();
  } else if (a.type === "motion") {
    if (a.motion.along) parts.push("move", targets, `along=${a.motion.along}`, ...(a.motion.reverse ? ["back"] : []));
    else parts.push("move", targets, `path=${q(a.motion.points.map((p) => `${n(p.x)},${n(p.y)}`).join(" "))}`);
    if (a.motion.curve) parts.push("curve");
    if (a.motion.orient) parts.push("orient");
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
    if (f.shape === "icon" && f.icon) parts.push(`icon=${f.icon}`);
    else if (f.shape === "image" && f.assetId) parts.push(`image=${f.assetId}`);
    else if (f.shape !== "dot") parts.push(`shape=${f.shape}`);
    if (f.shape !== "icon" && f.icon) parts.push(`icon=${f.icon}`);
    if (f.shape !== "image" && f.assetId) parts.push(`image=${f.assetId}`);
    if (f.trail) parts.push(`trail=${f.trail}`);
    if (f.count === 1) parts.push("once");
    else if (f.count !== undefined) parts.push(`count=${f.count}`);
    if (f.orient) parts.push("orient");
    if (f.back) {
      const b = f.back;
      if (b.shape === "icon" && b.icon) parts.push(`back-icon=${b.icon}`);
      else if (b.shape === "image" && b.assetId) parts.push(`back-image=${b.assetId}`);
      else if (b.shape) parts.push(`back-shape=${b.shape}`);
      if (b.shape !== "icon" && b.icon) parts.push(`back-icon=${b.icon}`);
      for (const k of ["color", "size", "speed", "rate", "count", "trail"] as const) if (b[k] !== undefined) parts.push(`back-${k}=${b[k]}`);
      if (b.orient !== undefined) parts.push(`back-orient=${b.orient}`);
      if (b.delayMs !== undefined) parts.push(`back-delay=${b.delayMs}ms`);
    }
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
