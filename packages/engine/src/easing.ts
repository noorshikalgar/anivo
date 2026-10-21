import type { Easing } from "@anivo/schema";

export type EaseFn = (p: number) => number;

const clamp01 = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p);

/** Cubic Bézier easing with control points (x1, y1, x2, y2), like CSS. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number) => {
    // Newton iterations first, bisection as the fallback.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-7) return t;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (p) => {
    const x = clamp01(p);
    if (x === 0 || x === 1) return x;
    return sampleY(solveT(x));
  };
}

/** Overshoot by approximately 10%, then settle. */
export const backOut: EaseFn = (p) => {
  const s = 1.70158;
  const t = clamp01(p) - 1;
  return t * t * ((s + 1) * t + s) + 1;
};

/**
 * Damped spring from 0 to 1, closed form (no simulation, so the result does
 * not depend on the frame rate). The input `p` maps to the settle time, the
 * time when the spring stays within 0.1% of its target.
 */
export function spring(stiffness: number, damping: number, mass: number): EaseFn {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  const position = (t: number): number => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const c2 = r1 / (r1 - r2);
    const c1 = 1 - c2;
    return 1 - (c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t));
  };

  // Find the settle time with a fixed scan. The scan is deterministic.
  const dt = 1 / 240;
  let settle = 0;
  for (let t = 0; t < 30; t += dt) {
    if (Math.abs(position(t) - 1) > 0.001) settle = t + dt;
  }
  if (settle === 0) settle = dt;

  return (p) => {
    const x = clamp01(p);
    if (x === 1) return 1;
    return position(x * settle);
  };
}

const NAMED: Record<string, EaseFn> = {
  linear: (p) => clamp01(p),
  "ease-in": cubicBezier(0.42, 0, 1, 1),
  "ease-out": cubicBezier(0, 0, 0.58, 1),
  "ease-in-out": cubicBezier(0.42, 0, 0.58, 1),
  "back-out": backOut,
  "spring-soft": spring(120, 20, 1),
  "spring-bouncy": spring(180, 12, 1),
  // Hold: no tween, the value jumps at the end (a hold key in a video editor).
  hold: (p) => (p >= 1 ? 1 : 0),
};

const cache = new Map<string, EaseFn>();

/** Return the easing function for an easing value from the schema. */
export function easingFn(easing: Easing): EaseFn {
  if (typeof easing === "string") return NAMED[easing] ?? NAMED["linear"]!;
  const key = JSON.stringify(easing);
  let fn = cache.get(key);
  if (!fn) {
    fn = "cubicBezier" in easing ? cubicBezier(...easing.cubicBezier) : spring(easing.spring.stiffness, easing.spring.damping, easing.spring.mass);
    cache.set(key, fn);
  }
  return fn;
}
