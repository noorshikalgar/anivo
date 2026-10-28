import type { Action, Color, Element, FlowParams, MorphableProps, Rect, Scene } from "@anivo/schema";
import { defaultDurationMs } from "@anivo/schema";
import type { CaptionFrame, ElementFrame, FrameColor, FrameState, Particle } from "./frame.js";
import { type TimedAction, type TimedStep, type Timeline, resolveTimeline, stepIndexAt } from "./timeline.js";
import { easingFn } from "./easing.js";

type StateMap = Record<string, ElementFrame>;

export interface Prepared {
  scene: Scene;
  timeline: Timeline;
  /** Draw order of element IDs. */
  order: string[];
  base: StateMap;
  /** `boundaries[i]` is the state at the end of step `i`. */
  boundaries: StateMap[];
  /** The scene camera, before step 1. */
  baseCamera: Rect;
  /** `cameras[i]` is the camera at the end of step `i`. */
  cameras: Rect[];
}

export interface EvaluateOptions {
  /**
   * Length of a connector in scene pixels. The layout package supplies it.
   * Without it, flow `chainFrom` has no delay and particles travel for a
   * maximum of 5 seconds.
   */
  connectorLength?: (connectorId: string) => number | undefined;
}

const clamp01 = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

function baseFrame(el: Element): ElementFrame {
  const label = el.type === "text" ? el.content.text : el.label?.text;
  const frame: ElementFrame = {
    id: el.id,
    type: el.type,
    z: el.z,
    visible: el.visible,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    opacity: el.opacity,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    strokeProgress: 1,
    fillProgress: 1,
    textReveal: 1,
    glow: 0,
    flash: 0,
    highlight: 0,
  };
  if (el.parentId !== undefined) frame.parentId = el.parentId;
  if (el.type === "code") frame.code = el.code;
  const s = el.style;
  if (s.fill !== undefined) frame.fill = s.fill;
  if (s.stroke !== undefined) frame.stroke = s.stroke;
  if (s.strokeWidth !== undefined) frame.strokeWidth = s.strokeWidth;
  if (s.cornerRadius !== undefined) frame.cornerRadius = s.cornerRadius;
  if (s.fontSize !== undefined) frame.fontSize = s.fontSize;
  if (s.textColor !== undefined) frame.textColor = s.textColor;
  if (label !== undefined) frame.label = label;
  return frame;
}

/** Reset temporary effect values. A boundary state has no effects. */
function settle(frame: ElementFrame): ElementFrame {
  const f: ElementFrame = { ...frame, scale: 1, offsetX: 0, offsetY: 0, strokeProgress: 1, fillProgress: 1, textReveal: 1, glow: 0, flash: 0, highlight: 0 };
  delete f.wipe;
  delete f.blur;
  delete f.march;
  delete f.cascade;
  delete f.cascadeWords;
  delete f.moving;
  delete f.spotlight;
  delete f.circle;
  delete f.roll;
  delete f.markBox;
  delete f.scramble;
  delete f.labelFrom;
  delete f.labelMix;
  delete f.codeFrom;
  delete f.codeMix;
  delete f.codeLinesFrom;
  delete f.codeLinesMix;
  delete f.codeType;
  for (const key of ["fill", "stroke", "textColor"] as const) {
    const c = f[key];
    if (c !== undefined && typeof c === "object") f[key] = c.to;
  }
  return f;
}

function finalColor(c: FrameColor | undefined): Color {
  if (c === undefined) return "default";
  return typeof c === "object" ? c.to : c;
}

/** Envelope for a sustained emphasis: in for 15%, hold, out for 15%. */
function envelope(p: number): number {
  if (p < 0.15) return p / 0.15;
  if (p > 0.85) return (1 - p) / 0.15;
  return 1;
}

function applyEnterExit(f: ElementFrame, action: Extract<Action, { type: "enter" | "exit" }>, eased: number, raw: number): void {
  const isExit = action.type === "exit";
  const p = isExit ? 1 - eased : eased;
  if (isExit && raw >= 1) {
    f.visible = false;
    return;
  }
  f.visible = true;
  const params = action.params;
  switch (action.effect) {
    case "fade":
      f.opacity *= clamp01(p);
      break;
    case "pop": {
      const from = params.fromScale ?? 0.6;
      f.scale *= lerp(from, 1, p);
      f.opacity *= clamp01((isExit ? 1 - raw : raw) * 2.5);
      break;
    }
    case "scale":
      f.scale *= lerp(params.fromScale ?? 0, 1, p);
      break;
    case "slide": {
      const d = (params.distance ?? 80) * (1 - p);
      const dir = params.direction ?? "up";
      // "up" means the element moves up into place, so it starts below.
      if (dir === "up") f.offsetY += d;
      else if (dir === "down") f.offsetY -= d;
      else if (dir === "left") f.offsetX += d;
      else f.offsetX -= d;
      f.opacity *= clamp01(p);
      break;
    }
    case "draw-on": {
      const fillDelay = params.fillDelay ?? 0.7;
      f.strokeProgress = clamp01(p / fillDelay);
      f.fillProgress = fillDelay >= 1 ? (p >= 1 ? 1 : 0) : clamp01((p - fillDelay) / (1 - fillDelay));
      break;
    }
    case "wipe":
      f.wipe = { direction: params.direction ?? "right", p: clamp01(p) };
      break;
    case "rise": {
      // Up into place from a short distance, with a fade: the most common entrance in motion design.
      f.offsetY += (params.distance ?? 36) * (1 - p);
      f.opacity *= clamp01(p * 1.4);
      break;
    }
    case "blur":
      // Out of focus into focus, with a fade.
      f.blur = (params.amount ?? 18) * (1 - p);
      f.opacity *= clamp01(p * 1.3);
      break;
    case "cascade":
      f.cascade = clamp01(p);
      if (params.unit === "word") f.cascadeWords = true;
      break;
    case "scramble":
      f.scramble = clamp01(p);
      f.opacity *= clamp01(p * 6);
      break;
    case "typewriter":
      f.textReveal = params.unit === "word" && f.label ? wordReveal(f.label, clamp01(p)) : clamp01(p);
      break;
  }
}

/** Word by word (docs/19 R12): the share of the characters up to the end of the last word that shows. */
function wordReveal(text: string, p: number): number {
  const ends: number[] = [];
  const re = /\S+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) ends.push(m.index + m[0].length);
  if (ends.length === 0 || p >= 1) return 1;
  // Round, as the letter typewriter does: the last word shows just before the end.
  const k = Math.round(p * ends.length);
  return k === 0 ? 0 : ends[k - 1]! / text.length;
}

type MarkParams = Extract<Action, { type: "mark" }>["mark"];

/** The character range of the n-th match of a phrase, by whole words, case-insensitive. */
function phraseRange(text: string, phrase: string, occurrence: number): { start: number; end: number } | undefined {
  const p = phrase.trim().toLowerCase();
  if (!p) return undefined;
  const t = text.toLowerCase();
  let from = 0;
  let n = 0;
  for (;;) {
    const i = t.indexOf(p, from);
    if (i < 0) return undefined;
    const before = i === 0 || /\W/.test(t[i - 1]!);
    const after = i + p.length >= t.length || /\W/.test(t[i + p.length]!);
    if (before && after && ++n === occurrence) return { start: i, end: i + p.length };
    from = i + 1;
  }
}

/** Mark words (docs/20 B1). The marks stay in the state, so later steps keep them. */
function applyMark(f: ElementFrame, m: MarkParams, p: number): void {
  // Clear fades the old marks out while the action runs.
  let marks = m.clear ? (f.marks ?? []).map((x) => ({ ...x, p: x.p * (1 - p) })).filter((x) => p < 1 && x.p > 0) : [...(f.marks ?? [])];
  if (m.clear && f.dimRest) {
    if (p < 1) f.dimRest = { ...f.dimRest, p: f.dimRest.p * (1 - p) };
    else delete f.dimRest;
  }
  const r = phraseRange(f.label ?? "", m.phrase, m.occurrence);
  if (r) {
    marks = marks.filter((x) => x.start !== r.start || x.end !== r.end);
    marks.push({ ...r, ...(m.color ? { color: m.color } : {}), ...(m.highlight ? { highlight: m.highlight } : {}), ...(m.underline ? { underline: m.underline } : {}), ...(m.strike ? { strike: m.strike } : {}), p });
  }
  if (marks.length) f.marks = marks;
  else delete f.marks;
  if (m.dim) f.dimRest = { color: m.dim, p };
}

function applyMorph(f: ElementFrame, to: MorphableProps, p: number): void {
  for (const key of ["x", "y", "width", "height", "rotation", "opacity", "strokeWidth", "cornerRadius", "fontSize"] as const) {
    const target = to[key];
    if (target === undefined) continue;
    const from = f[key] ?? target;
    f[key] = lerp(from, target, p);
  }
  for (const key of ["fill", "stroke", "textColor"] as const) {
    const target = to[key];
    if (target === undefined) continue;
    const from = finalColor(f[key]);
    f[key] = p >= 1 || from === target ? target : { from, to: target, p };
  }
  if (to.shape !== undefined && (f.type === "rectangle" || f.type === "ellipse" || f.type === "diamond")) {
    const from = f.shape ?? f.type;
    if (p >= 1 || from === to.shape) {
      f.shape = to.shape;
      delete f.shapeFrom;
      delete f.shapeMix;
    } else {
      f.shapeFrom = from;
      f.shape = to.shape;
      f.shapeMix = p;
    }
  }
  if (to.label !== undefined) {
    const from = f.label ?? "";
    if (p >= 1 || from === to.label) {
      f.label = to.label;
      delete f.labelFrom;
      delete f.labelMix;
    } else {
      f.labelFrom = from;
      f.label = to.label;
      f.labelMix = p;
    }
  }
}

function applyEmphasis(f: ElementFrame, action: Extract<Action, { type: "emphasis" }>, raw: number, span = defaultDurationMs(action)): void {
  const params = action.params;
  const count = params.count;
  switch (action.effect) {
    case "march":
      // Dashes move along an arrow (docs/21 C2): 60 px each second, toward the arrow end.
      f.march = (raw * (action.durationMs ?? 3000)) / 1000;
      break;
    case "pulse": {
      const n = count ?? 2;
      f.scale *= 1 + ((params.scale ?? 1.08) - 1) * Math.abs(Math.sin(Math.PI * n * raw));
      break;
    }
    case "shake": {
      const n = count ?? 4;
      f.offsetX += (params.amplitude ?? 8) * Math.sin(2 * Math.PI * n * raw) * (1 - raw);
      break;
    }
    case "wiggle": {
      const n = count ?? 3;
      f.rotation += (params.degrees ?? 4) * Math.sin(2 * Math.PI * n * raw) * (1 - raw);
      break;
    }
    case "glow":
      f.glow = Math.max(f.glow, Math.sin(Math.PI * raw));
      f.glowColor = params.color ?? "accent";
      break;
    case "flash":
      f.flash = Math.max(f.flash, Math.sin(Math.PI * raw));
      f.flashColor = params.color ?? "warning";
      break;
    case "highlight":
      f.highlight = Math.max(f.highlight, envelope(raw));
      f.highlightColor = params.color ?? "warning-soft";
      break;
    case "focus":
      // Handled once per action in applyFocus, because it changes other elements.
      break;
    case "spotlight":
      f.spotlight = Math.max(f.spotlight ?? 0, envelope(raw));
      break;
    case "circle":
      // Draws around in the first 30 %, stays, and fades in the last 15 %.
      f.circle = { p: Math.min(1, raw / 0.3), alpha: raw > 0.85 ? (1 - raw) / 0.15 : 1, color: params.color ?? "danger", ...(params.shape && params.shape !== "circle" ? { shape: params.shape } : {}) };
      break;
    case "float":
    case "breathe": {
      // Idle motion (docs/22 D6): one slow wave each 3 s, that starts and stops softly.
      const total = span;
      const ms = raw * total;
      const env = smoothstep(Math.min(1, ms / 700, (total - ms) / 700));
      const wave = Math.sin((2 * Math.PI * ms) / 3000);
      if (action.effect === "float") f.offsetY -= (params.amplitude ?? 10) * wave * env;
      else f.scale *= 1 + ((params.scale ?? 1.04) - 1) * ((1 - Math.cos((2 * Math.PI * ms) / 3000)) / 2) * env;
      break;
    }
  }
}

const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function applyFocus(state: StateMap, focusTargets: string[], dimTo: number, raw: number): void {
  const dim = lerp(1, dimTo, envelope(raw));
  const targets = new Set(focusTargets);
  for (const id of Object.keys(state)) {
    if (targets.has(id)) continue;
    const f = state[id]!;
    state[id] = { ...f, opacity: f.opacity * dim };
  }
}

function applyCode(f: ElementFrame, c: Extract<Action, { type: "code" }>["code"], p: number): void {
  if (c.op === "highlight") {
    const from = f.codeLines;
    if (p >= 1) {
      if (c.lines) f.codeLines = c.lines;
      else delete f.codeLines;
      delete f.codeLinesFrom;
      delete f.codeLinesMix;
      return;
    }
    if (from) f.codeLinesFrom = from;
    else delete f.codeLinesFrom;
    if (c.lines) f.codeLines = c.lines;
    else delete f.codeLines;
    f.codeLinesMix = p;
  } else if (c.op === "type" && c.lines) {
    if (p < 1) f.codeType = { lines: c.lines, p };
  } else if (c.op === "diff" && c.newCode !== undefined) {
    const from = f.code ?? "";
    // The block grows or shrinks with the line count (line height: 1.5 x font size).
    const lineHeight = (f.fontSize ?? 24) * 1.5;
    f.height += (c.newCode.split("\n").length - from.split("\n").length) * lineHeight * p;
    f.code = c.newCode;
    if (p < 1) {
      f.codeFrom = from;
      f.codeMix = p;
    }
  }
}

type MotionParams = Extract<Action, { type: "motion" }>["motion"];
const motionCache = new WeakMap<MotionParams, { pts: { x: number; y: number }[]; cum: number[] }>();

/** The path as a polyline with cumulative lengths. A curve is a Catmull-Rom spline through the points. */
function motionPath(m: MotionParams) {
  let c = motionCache.get(m);
  if (c) return c;
  let pts = m.points;
  if (m.curve && pts.length > 2) {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      for (let k = 0; k < 16; k++) {
        const t = k / 16;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a: number, b: number, c2: number, d: number) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
        out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    out.push(pts[pts.length - 1]!);
    pts = out;
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  c = { pts, cum };
  motionCache.set(m, c);
  return c;
}

/** Motion path (FR-STEP-15): the element center at the eased share of the path length. */
function applyMotion(f: ElementFrame, m: MotionParams, p: number, off = { dx: 0, dy: 0 }): void {
  const { pts, cum } = motionPath(m);
  const total = cum[cum.length - 1]!;
  const d = Math.min(1, Math.max(0, p)) * total;
  let i = 1;
  while (i < pts.length - 1 && cum[i]! < d) i++;
  const a = pts[i - 1]!;
  const b = pts[i]!;
  const seg = cum[i]! - cum[i - 1]!;
  const t = seg > 0 ? (d - cum[i - 1]!) / seg : 1;
  f.x = a.x + (b.x - a.x) * t - f.width / 2 + off.dx;
  f.y = a.y + (b.y - a.y) * t - f.height / 2 + off.dy;
  if (m.orient && seg > 0) f.rotation = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Apply one timed action to the state at time `t`. Copy-on-write for each touched element. */
function applyTimedAction(state: StateMap, ta: TimedAction, t: number): void {
  const { action } = ta;
  if (action.type === "flow" || action.type === "wait" || action.type === "camera") return;
  if (t < ta.startMs) return;
  const span = ta.endMs - ta.startMs;
  const raw = span <= 0 ? 1 : clamp01((t - ta.startMs) / span);
  const eased = ta.ease(raw);

  if (action.type === "emphasis" && action.effect === "focus") {
    if (ta.targetIndex === 0 && raw < 1) applyFocus(state, ta.focusTargets ?? action.targets, action.params.dimTo ?? 0.25, raw);
    return;
  }

  const current = state[ta.target];
  if (!current) return;
  const f: ElementFrame = { ...current };
  if (action.type === "enter" || action.type === "exit") applyEnterExit(f, action, eased, raw);
  else if (action.type === "morph") applyMorph(f, action.to, eased);
  else if (action.type === "mark") applyMark(f, action.mark, eased);
  else if (action.type === "emphasis" && raw < 1) {
    // A circle or spotlight on a group marks the group once: the first part carries it, with the box of all parts.
    if (ta.groupParts) {
      if (ta.groupParts[0] !== ta.target) return;
      const boxes = ta.groupParts.map((id) => state[id]).filter((e): e is ElementFrame => !!e && e.visible);
      if (boxes.length) {
        const x = Math.min(...boxes.map((e) => e.x));
        const y = Math.min(...boxes.map((e) => e.y));
        f.markBox = { x, y, width: Math.max(...boxes.map((e) => e.x + e.width)) - x, height: Math.max(...boxes.map((e) => e.y + e.height)) - y };
      }
    }
    applyEmphasis(f, action, raw, ta.endMs - ta.startMs);
  }
  else if (action.type === "code") applyCode(f, action.code, eased);
  else if (action.type === "motion") {
    applyMotion(f, action.motion, eased, ta.moveOffset);
    // On top while it moves and after it arrives, until the step ends (a sent packet stops next to arrow labels).
    if (raw > 0) f.moving = true;
  }
  else if (action.type === "counter") {
    const c = action.counter;
    const n = lerp(c.from, c.to, eased);
    const rolling = c.roll && raw < 1 && (c.style === undefined || c.style === "plain" || c.style === "thousands");
    // Rolling digits show the digit below; the next digit rolls in from below (no round up).
    const shownN = rolling ? Math.sign(n) * Math.floor(Math.abs(n) * 10 ** c.decimals) / 10 ** c.decimals : n;
    f.label = c.format.replace("{n}", formatCount(shownN, c.decimals, c.style));
    f.tabular = true;
    if (rolling) f.roll = { value: n, decimals: c.decimals };
  }
  state[ta.target] = f;
}

/** Write a count number in a style (docs/21 C9). The same text on every machine (no locale). */
export function formatCount(n: number, decimals: number, style: "plain" | "thousands" | "compact" | "duration" | undefined): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const group = (s: string) => {
    const [i, d] = s.split(".");
    return i!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? "." + d : "");
  };
  if (style === "thousands") return sign + group(a.toFixed(decimals));
  if (style === "compact") {
    const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
    // The same number of decimals all the time, so the text does not change its length while it counts.
    for (const [v, u] of units) if (a >= v) return sign + (a / v).toFixed(decimals) + u;
    return sign + a.toFixed(decimals);
  }
  if (style === "duration") {
    const t = Math.floor(a);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = String(t % 60).padStart(2, "0");
    return sign + (h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`);
  }
  return n.toFixed(decimals);
}

/** The camera rectangle that fits the targets with padding, at the aspect ratio of the video. */
function fitCamera(state: StateMap, ids: string[], padding: number, aspect: number): Rect | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of ids) {
    const f = state[id];
    if (!f || f.type === "connector" || f.type === "group") continue;
    x0 = Math.min(x0, f.x);
    y0 = Math.min(y0, f.y);
    x1 = Math.max(x1, f.x + f.width);
    // An icon label is below the icon.
    y1 = Math.max(y1, f.y + f.height + (f.type === "icon" && f.label ? 52 : 0));
  }
  if (!Number.isFinite(x0)) return undefined;
  let w = x1 - x0 + padding * 2;
  let h = y1 - y0 + padding * 2;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/** Interpolate two cameras: the center moves in a line, the zoom in log scale (constant zoom speed). */
function mixCamera(a: Rect, b: Rect, p: number): Rect {
  const w = a.width * (b.width / a.width) ** p;
  const h = a.height * (b.height / a.height) ** p;
  const cx = lerp(a.x + a.width / 2, b.x + b.width / 2, p);
  const cy = lerp(a.y + a.height / 2, b.y + b.height / 2, p);
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/** The camera after the camera actions of a step that started before `t`. */
function cameraAt(step: TimedStep, start: Rect, base: Rect, state: StateMap, aspect: number, t: number): Rect {
  let cam = start;
  for (const ta of step.actions) {
    if (ta.action.type !== "camera" || t < ta.startMs) continue;
    const c = ta.action.camera;
    const span = ta.endMs - ta.startMs;
    const raw = span <= 0 ? 1 : clamp01((t - ta.startMs) / span);
    if (c.op === "follow") {
      // Keep the target in the center; ease in over the first fifth of the action, so the camera does not jump.
      const f = state[(ta.cameraTargets ?? [])[0] ?? ""];
      if (!f) continue;
      const cx = f.x + f.width / 2;
      const cy = f.y + f.height / 2;
      const centered = { x: cx - cam.width / 2, y: cy - cam.height / 2, width: cam.width, height: cam.height };
      cam = mixCamera(cam, centered, ta.ease(clamp01(raw * 5)));
      continue;
    }
    let target: Rect | undefined;
    if (c.op === "drift") {
      // A slow push-in to the center of the targets (or of the view).
      const fit = ((ta.cameraTargets ?? []).length ? fitCamera(state, ta.cameraTargets ?? [], c.padding, aspect) : undefined) ?? cam;
      const cx = fit.x + fit.width / 2;
      const cy = fit.y + fit.height / 2;
      const w = cam.width / c.zoom;
      const h = cam.height / c.zoom;
      target = { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
    } else target = c.op === "reset" ? base : c.op === "pan" && c.rect ? c.rect : c.op === "zoom-to" ? fitCamera(state, ta.cameraTargets ?? [], c.padding, aspect) : undefined;
    if (!target) continue;
    cam = mixCamera(cam, target, ta.ease(raw));
  }
  return cam;
}

/** Calculate the state at the end of each step (docs/06 "Stage 1", item 4). */
function buildBoundaries(timeline: Timeline, base: StateMap): StateMap[] {
  const boundaries: StateMap[] = [];
  let prev = base;
  for (const step of timeline.steps) {
    const state: StateMap = { ...prev };
    for (const ta of step.actions) applyTimedAction(state, ta, Number.POSITIVE_INFINITY);
    for (const id of Object.keys(state)) state[id] = settle(state[id]!);
    boundaries.push(state);
    prev = state;
  }
  return boundaries;
}

/**
 * Visibility rule (docs/06): an element whose first action is `enter` is not
 * visible in the base state. The rule is derived here, so it stays correct
 * when operations add, move, or remove actions.
 */
function firstActionIsEnter(timeline: Timeline): Set<string> {
  // The timeline has the targets after group expansion, in step and action order.
  const seen = new Set<string>();
  const hidden = new Set<string>();
  for (const step of timeline.steps) {
    for (const ta of step.actions) {
      if (seen.has(ta.target)) continue;
      seen.add(ta.target);
      if (ta.action.type === "enter") hidden.add(ta.target);
    }
  }
  return hidden;
}

export function prepare(scene: Scene): Prepared {
  const timeline = resolveTimeline(scene);
  const hidden = firstActionIsEnter(timeline);
  const base: StateMap = {};
  for (const el of Object.values(scene.elements)) {
    base[el.id] = baseFrame(el);
    if (hidden.has(el.id)) base[el.id]!.visible = false;
  }
  const order = Object.values(scene.elements)
    .sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((el) => el.id);
  const boundaries = buildBoundaries(timeline, base);
  const v = scene.settings.video;
  const baseCamera = scene.settings.camera ?? { x: 0, y: 0, width: v.width, height: v.height };
  const aspect = v.width / v.height;
  const cameras: Rect[] = [];
  timeline.steps.forEach((step, i) => {
    const start = i === 0 ? baseCamera : cameras[i - 1]!;
    cameras.push(cameraAt(step, start, baseCamera, boundaries[i]!, aspect, Number.POSITIVE_INFINITY));
  });
  return { scene, timeline, order, base, boundaries, baseCamera, cameras };
}

/** Simple deterministic hash of two integers to [0, 1). */
function hash01(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h / 4294967296;
}

const MAX_TRAVEL_MS_UNKNOWN = 5000;

function flowParticles(step: TimedStep, t: number, opts: EvaluateOptions, out: Particle[]): void {
  for (const ta of step.actions) {
    if (ta.action.type !== "flow" || ta.targetIndex !== 0) continue;
    const flow: FlowParams = ta.action.flow;
    // A flow emits until its own end, or until the step hold ends, whichever is later.
    const windowStart = ta.startMs;
    const windowEnd = Math.max(ta.endMs, step.holdEndMs);
    const targets = ta.action.targets.filter((id) => !flow.skip.includes(id));
    if (targets.length === 0) continue;

    // Direction both with own back settings: two streams, each with its settings. Else one stream.
    const streams: { p: FlowParams; reverse: boolean | "alternate"; delay: number }[] =
      flow.direction === "both" && flow.back
        ? [
            { p: flow, reverse: false, delay: 0 },
            { p: { ...flow, ...flow.back } as FlowParams, reverse: true, delay: flow.back.delayMs ?? 0 },
          ]
        : [{ p: flow, reverse: flow.direction === "reverse" ? true : flow.direction === "both" ? "alternate" : false, delay: 0 }];
    for (const { p, reverse: rev, delay } of streams) {
      const chainLen = p.chainFrom !== undefined ? opts.connectorLength?.(p.chainFrom) : undefined;
      const chainDelay = chainLen !== undefined ? (chainLen / p.speed) * 1000 : 0;
      const emitStart = windowStart + chainDelay + delay;
      const emitEnd = windowEnd + chainDelay + delay;
      const interval = 1000 / p.rate;

      let maxTravel = 0;
      for (const id of targets) {
        const len = opts.connectorLength?.(id);
        maxTravel = Math.max(maxTravel, len !== undefined ? (len / p.speed) * 1000 : MAX_TRAVEL_MS_UNKNOWN);
      }

      const kMin = Math.max(0, Math.ceil((t - maxTravel - emitStart) / interval));
      let kMax = Math.floor((Math.min(t, emitEnd - 1e-6) - emitStart) / interval);
      if (p.count !== undefined) kMax = Math.min(kMax, p.count - 1);
      for (let k = kMin; k <= kMax; k++) {
        const emit = emitStart + k * interval;
        const age = t - emit;
        if (age < 0) continue;
        const distance = (age * p.speed) / 1000;
        let chosen: string[];
        if (p.distribute === "all") chosen = targets;
        else if (p.distribute === "round-robin") chosen = [targets[k % targets.length]!];
        else chosen = [targets[Math.floor(hash01(k, targets.length) * targets.length)]!];
        const reverse = rev === "alternate" ? k % 2 === 1 : rev;
        for (const connectorId of chosen) {
          const len = opts.connectorLength?.(connectorId);
          if (len !== undefined && distance > len) continue;
          if (len === undefined && age > MAX_TRAVEL_MS_UNKNOWN) continue;
          out.push({ connectorId, distance, reverse, shape: p.shape, ...(p.icon ? { icon: p.icon } : {}), ...(p.assetId ? { assetId: p.assetId } : {}), size: p.size, color: p.color, trail: p.trail, orient: p.orient });
        }
      }
    }
  }
}

/**
 * The state of the scene at `timeMs`. Pure: the same input gives the same
 * output, with no state between calls (docs/06 "Core rule").
 */
export function evaluateAt(prepared: Prepared, timeMs: number, opts: EvaluateOptions = {}): FrameState {
  const { timeline, boundaries, base, order, scene, baseCamera, cameras } = prepared;
  // A negative time gives the base state, before any action starts. At time 0,
  // actions of step 1 have started at progress 0, so time 0 is not the base state.
  const t = timeMs;
  const i = timeMs < 0 ? -1 : stepIndexAt(timeline, t);
  const state: StateMap = { ...(i <= 0 ? base : boundaries[i - 1]!) };
  const particles: Particle[] = [];

  if (i >= 0) {
    const step = timeline.steps[i]!;
    for (const ta of step.actions) applyTimedAction(state, ta, t);
    // Particles still in flight from the previous step finish their travel.
    if (i > 0) flowParticles(timeline.steps[i - 1]!, t, opts, particles);
    flowParticles(step, t, opts, particles);
  }

  const v = scene.settings.video;
  const camera = i < 0 ? baseCamera : cameraAt(timeline.steps[i]!, i === 0 ? baseCamera : cameras[i - 1]!, baseCamera, state, v.width / v.height, t);
  // A step transition is centered on the step start: half before, half after.
  let transition: FrameState["transition"];
  for (const ts of timeline.steps) {
    const tr = scene.steps[ts.index]!.transition;
    if (!tr || tr.durationMs <= 0) continue;
    const from = ts.startMs - tr.durationMs / 2;
    if (t >= from && t < from + tr.durationMs) {
      transition = { kind: tr.kind, progress: (t - from) / tr.durationMs };
      break;
    }
  }
  // After a transition, the screen shows the new step. An element that the new step removes
  // during the transition stays hidden: else it comes back with the transition, then fades out (a flash).
  const tr = i >= 0 ? scene.steps[timeline.steps[i]!.index]!.transition : undefined;
  const hideExits = tr && tr.durationMs > 0 ? timeline.steps[i]!.actions.filter((ta) => ta.action.type === "exit" && ta.startMs < timeline.steps[i]!.startMs + tr.durationMs / 2).map((ta) => ta.target) : [];
  applyKeys(scene, state, t);
  for (const id of hideExits) if (state[id]) state[id] = { ...state[id]!, opacity: 0 };
  fadeWithEnds(scene, state);
  // A particle travels only on an arrow that shows and is drawn (the cache filmstrip had mail flying before its arrow).
  const onShownArrow = (p: Particle) => {
    const c = state[p.connectorId];
    return !c || (c.visible && c.opacity > 0.05 && c.strokeProgress >= 0.95);
  };
  const shownParticles = particles.filter(onShownArrow);
  const caption = i >= 0 ? stepCaptionAt(scene, timeline.steps, i, t, boundaries, cameras) : undefined;
  const followed = applyFollow(scene, base, state);
  return { timeMs: Math.max(0, t), elements: order.map((id) => followed[id] ?? state[id]!), particles: shownParticles, camera, ...(caption ? { caption } : {}), ...(transition ? { transition } : {}) };
}

/**
 * Follow (docs/19 R6): an element with `follow` moves by the amount that its
 * leader moved from the leader's base place. A chain of leaders adds up (at
 * most 8). Only the output frame changes, so steps do not add it twice.
 */
function applyFollow(scene: Scene, base: StateMap, state: StateMap): StateMap {
  const out: StateMap = {};
  const delta = (id: string, depth: number): { dx: number; dy: number } => {
    const el = scene.elements[id];
    if (!el?.follow || depth > 8) return { dx: 0, dy: 0 };
    const lead = state[el.follow];
    const lead0 = base[el.follow];
    if (!lead || !lead0) return { dx: 0, dy: 0 };
    const up = delta(el.follow, depth + 1);
    return { dx: lead.x - lead0.x + up.dx, dy: lead.y - lead0.y + up.dy };
  };
  for (const el of Object.values(scene.elements)) {
    if (!el.follow) continue;
    const f = state[el.id];
    if (!f) continue;
    const d = delta(el.id, 0);
    if (d.dx !== 0 || d.dy !== 0) out[el.id] = { ...f, x: f.x + d.dx, y: f.y + d.dy };
  }
  return out;
}

/**
 * Element keyframes (docs/32): a property with keys takes its value from the
 * keys at video time t, over what the steps set. Before the first key: the
 * first value; after the last: the last value; between: the ease of the
 * earlier key (default ease-in-out).
 */
function applyKeys(scene: Scene, state: StateMap, t: number): void {
  const time = Math.max(0, t);
  for (const el of Object.values(scene.elements)) {
    if (!el.keys) continue;
    const cur = state[el.id];
    if (!cur) continue;
    const f: ElementFrame = { ...cur };
    for (const [prop, keys] of Object.entries(el.keys)) {
      if (!keys || keys.length === 0) continue;
      let i = 0;
      while (i < keys.length && keys[i]!.t <= time) i++;
      const a = keys[Math.max(0, i - 1)]!;
      const b = keys[Math.min(keys.length - 1, i)]!;
      const span = b.t - a.t;
      const p = i === 0 || i >= keys.length || span <= 0 ? (i === 0 ? 0 : 1) : easingFn(a.ease ?? "ease-in-out")((time - a.t) / span);
      const from = i === 0 ? b : a;
      if (typeof from.v === "number" && typeof b.v === "number") {
        const v = from.v + (b.v - from.v) * p;
        if (prop === "scale") f.scale *= v;
        else (f as unknown as Record<string, number>)[prop] = v;
      } else if (typeof from.v === "string" && typeof b.v === "string") {
        (f as unknown as Record<string, FrameColor>)[prop] = p >= 1 || from.v === b.v ? b.v : p <= 0 ? from.v : { from: from.v, to: b.v, p };
      }
    }
    state[el.id] = f;
  }
}

/**
 * An arrow goes away with the elements at its ends (audit e3): when an end
 * fades out or exits, the arrow fades with it. So an exit does not leave
 * arrows that point at nothing.
 */
function fadeWithEnds(scene: Scene, state: StateMap): void {
  const shown = (id: string): number => {
    const el = scene.elements[id];
    if (!el) return 1;
    if (el.type === "group") {
      let best = 0;
      for (const c of Object.values(scene.elements)) if (c.parentId === id) best = Math.max(best, shown(c.id));
      return best;
    }
    const f = state[id];
    return !f ? 1 : f.visible ? f.opacity : 0;
  };
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "connector") continue;
    const f = state[el.id];
    if (!f || !f.visible) continue;
    let k = 1;
    if (el.start.kind === "bound") k = Math.min(k, shown(el.start.elementId));
    if (el.end.kind === "bound") k = Math.min(k, shown(el.end.elementId));
    if (k < 1) state[el.id] = { ...f, opacity: f.opacity * k, ...(f.opacity > 0.05 && k <= 0.05 ? { hiddenByEnds: true } : {}) };
  }
}

const CAPTION_FADE_MS = 250;

/** The box of an element; an icon label is under the icon, outside its box, so the box grows down to hold it. */
function withIconLabel(f: ElementFrame): Rect {
  const extra = f.type === "icon" && f.label ? Math.round((f.fontSize ?? 24) * 1.4 + 8) : 0;
  return { x: f.x, y: f.y, width: f.width, height: f.height + extra };
}

/** The box of a visible element, or for a group, the union box of its visible parts. */
function anchorBox(scene: Scene, id: string, state: StateMap): Rect | undefined {
  const el = scene.elements[id];
  if (!el) return undefined;
  if (el.type !== "group") {
    const f = state[id];
    return f && f.visible && f.opacity > 0 ? withIconLabel(f) : undefined;
  }
  let box: Rect | undefined;
  for (const child of Object.values(scene.elements)) {
    if (child.parentId !== id) continue;
    const b = anchorBox(scene, child.id, state);
    if (!b) continue;
    if (!box) box = { ...b };
    else {
      const x2 = Math.max(box.x + box.width, b.x + b.width);
      const y2 = Math.max(box.y + box.height, b.y + b.height);
      box = { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), width: 0, height: 0 };
      box.width = x2 - box.x;
      box.height = y2 - box.y;
    }
  }
  return box;
}

/** The caption of step i at time t. A step with no caption fades out the caption of the step before. */
function stepCaptionAt(scene: Scene, steps: TimedStep[], i: number, t: number, boundaries: StateMap[], cameras: Rect[]): CaptionFrame | undefined {
  let k = i;
  let fadeOut = 1;
  if (!steps[i]!.caption) {
    if (i === 0 || !steps[i - 1]!.caption || t >= steps[i]!.startMs + CAPTION_FADE_MS) return undefined;
    k = i - 1;
    fadeOut = 1 - (t - steps[i]!.startMs) / CAPTION_FADE_MS;
  }
  const ts = steps[k]!;
  const c = scene.steps[ts.index]!.caption!;
  const timing = ts.caption!;
  if (t < timing.startMs) return undefined;
  const reveal = timing.typedMs <= timing.startMs ? 1 : Math.min(1, (t - timing.startMs) / (timing.typedMs - timing.startMs));
  const fadeIn = Math.min(1, (t - timing.startMs) / 150);
  // The place comes from the end of the step, so the caption does not move while elements move.
  const state = boundaries[k]!;
  const anchorId = c.side === "top" || c.side === "bottom" ? undefined : (c.anchor ?? ts.actions.find((a) => a.target !== "" && a.action.type !== "exit" && state[a.target]?.type !== "connector" && state[a.target]?.visible)?.target);
  const anchor = anchorId ? anchorBox(scene, anchorId, state) : undefined;
  const avoid = Object.values(state)
    .filter((e) => e.visible && e.opacity > 0.05 && e.type !== "group" && e.type !== "connector" && e.id !== anchorId)
    .map((e) => ({ ...withIconLabel(e), text: e.type === "text" || !!e.label }));
  // Arrow lines at the end of the step: small boxes along the line between the two ends (curves are close to it).
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "connector" || el.start.kind !== "bound" || el.end.kind !== "bound") continue;
    const c = state[el.id];
    const a = state[el.start.elementId];
    const b = state[el.end.elementId];
    if (!c || !c.visible || c.opacity <= 0.05 || !a || !b) continue;
    const ax = a.x + a.width / 2;
    const ay = a.y + a.height / 2;
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 40));
    // Weight: a box counts as text, so a caption does not lie on a line.
    for (let i = 1; i < n; i++) avoid.push({ x: ax + ((bx - ax) * i) / n - 12, y: ay + ((by - ay) * i) / n - 12, width: 24, height: 24, text: true });
  }
  // Elements that move in the step: keep their way clear too (the CDN filmstrip had a packet behind a caption).
  for (const ta of ts.actions) {
    if (ta.action.type !== "motion") continue;
    const f = state[ta.target];
    const half = f ? Math.max(f.width, f.height) / 2 + 10 : 40;
    const pts = ta.action.motion.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1] ?? a;
      for (const u of [0, 0.5]) avoid.push({ x: a.x + (b.x - a.x) * u - half, y: a.y + (b.y - a.y) * u - half, width: half * 2, height: half * 2, text: false });
    }
  }
  const cam = cameras[k];
  return { text: c.text, reveal, opacity: Math.max(0, Math.min(fadeIn, fadeOut)), side: c.side, avoid, ...(cam ? { cam } : {}), ...(anchor ? { anchor, anchorId } : {}) };
}

const preparedCache = new WeakMap<Scene, Prepared>();

/**
 * `evaluate(scene, timeMs)` from docs/06. It caches the prepared timeline for
 * each scene object. Scenes are immutable, so the cache is always correct.
 */
export function evaluate(scene: Scene, timeMs: number, opts?: EvaluateOptions): FrameState {
  let prepared = preparedCache.get(scene);
  if (!prepared) {
    prepared = prepare(scene);
    preparedCache.set(scene, prepared);
  }
  return evaluateAt(prepared, timeMs, opts);
}
