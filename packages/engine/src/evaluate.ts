import type { Action, Color, Element, FlowParams, MorphableProps, Scene } from "@anivo/schema";
import type { ElementFrame, FrameColor, FrameState, Particle } from "./frame.js";
import { type TimedAction, type TimedStep, type Timeline, resolveTimeline, stepIndexAt } from "./timeline.js";

type StateMap = Record<string, ElementFrame>;

export interface Prepared {
  scene: Scene;
  timeline: Timeline;
  /** Draw order of element IDs. */
  order: string[];
  base: StateMap;
  /** `boundaries[i]` is the state at the end of step `i`. */
  boundaries: StateMap[];
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
  delete f.labelFrom;
  delete f.labelMix;
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
    case "typewriter":
      f.textReveal = clamp01(p);
      break;
  }
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

function applyEmphasis(f: ElementFrame, action: Extract<Action, { type: "emphasis" }>, raw: number): void {
  const params = action.params;
  const count = params.count;
  switch (action.effect) {
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
  }
}

function applyFocus(state: StateMap, focusTargets: string[], dimTo: number, raw: number): void {
  const dim = lerp(1, dimTo, envelope(raw));
  const targets = new Set(focusTargets);
  for (const id of Object.keys(state)) {
    if (targets.has(id)) continue;
    const f = state[id]!;
    state[id] = { ...f, opacity: f.opacity * dim };
  }
}

/** Apply one timed action to the state at time `t`. Copy-on-write for each touched element. */
function applyTimedAction(state: StateMap, ta: TimedAction, t: number): void {
  const { action } = ta;
  if (action.type === "flow" || action.type === "wait") return;
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
  else if (action.type === "emphasis" && raw < 1) applyEmphasis(f, action, raw);
  state[ta.target] = f;
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
  return { scene, timeline, order, base, boundaries: buildBoundaries(timeline, base) };
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

    const chainLen = flow.chainFrom !== undefined ? opts.connectorLength?.(flow.chainFrom) : undefined;
    const chainDelay = chainLen !== undefined ? (chainLen / flow.speed) * 1000 : 0;
    const emitStart = windowStart + chainDelay;
    const emitEnd = windowEnd + chainDelay;
    const interval = 1000 / flow.rate;

    let maxTravel = 0;
    for (const id of targets) {
      const len = opts.connectorLength?.(id);
      maxTravel = Math.max(maxTravel, len !== undefined ? (len / flow.speed) * 1000 : MAX_TRAVEL_MS_UNKNOWN);
    }

    const kMin = Math.max(0, Math.ceil((t - maxTravel - emitStart) / interval));
    const kMax = Math.floor((Math.min(t, emitEnd - 1e-6) - emitStart) / interval);
    for (let k = kMin; k <= kMax; k++) {
      const emit = emitStart + k * interval;
      const age = t - emit;
      if (age < 0) continue;
      const distance = (age * flow.speed) / 1000;
      let chosen: string[];
      if (flow.distribute === "all") chosen = targets;
      else if (flow.distribute === "round-robin") chosen = [targets[k % targets.length]!];
      else chosen = [targets[Math.floor(hash01(k, targets.length) * targets.length)]!];
      const reverse = flow.direction === "reverse" || (flow.direction === "both" && k % 2 === 1);
      for (const connectorId of chosen) {
        const len = opts.connectorLength?.(connectorId);
        if (len !== undefined && distance > len) continue;
        if (len === undefined && age > MAX_TRAVEL_MS_UNKNOWN) continue;
        out.push({ connectorId, distance, reverse, shape: flow.shape, size: flow.size, color: flow.color, trail: flow.trail });
      }
    }
  }
}

/**
 * The state of the scene at `timeMs`. Pure: the same input gives the same
 * output, with no state between calls (docs/06 "Core rule").
 */
export function evaluateAt(prepared: Prepared, timeMs: number, opts: EvaluateOptions = {}): FrameState {
  const { timeline, boundaries, base, order, scene } = prepared;
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
  const camera = scene.settings.camera ?? { x: 0, y: 0, width: v.width, height: v.height };
  return { timeMs: Math.max(0, t), elements: order.map((id) => state[id]!), particles, camera };
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
