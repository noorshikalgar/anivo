import type { Action, EasingName } from "./steps.js";

/** Default action durations in milliseconds. See docs/06 "Default timing". */
export const DEFAULT_DURATION_MS = {
  enter: 500,
  "enter:draw-on": 800,
  exit: 350,
  morph: 600,
  emphasis: 800,
  flow: 2000,
  wait: 1000,
  camera: 1000,
  counter: 1200,
  code: 800,
  motion: 1500,
  mark: 500,
} as const;

/** Typewriter duration: 40 ms per character, maximum 2000 ms. */
export const TYPEWRITER_MS_PER_CHAR = 40;
export const TYPEWRITER_MAX_MS = 2000;

export const DEFAULT_EASING: Record<Action["type"], EasingName> = {
  enter: "ease-out",
  exit: "ease-in",
  morph: "ease-in-out",
  emphasis: "ease-in-out",
  flow: "linear",
  wait: "linear",
  camera: "ease-in-out",
  counter: "ease-out",
  code: "ease-in-out",
  motion: "ease-in-out",
  mark: "ease-out",
};

/** Default duration of an action when `durationMs` is not set. */
export function defaultDurationMs(action: Action, textLength = 0): number {
  if (action.durationMs !== undefined) return action.durationMs;
  if (action.type === "enter" || action.type === "exit") {
    if (action.effect === "typewriter") return Math.min(TYPEWRITER_MAX_MS, Math.max(1, textLength) * TYPEWRITER_MS_PER_CHAR);
    if (action.effect === "draw-on" && action.type === "enter") return DEFAULT_DURATION_MS["enter:draw-on"];
  }
  return DEFAULT_DURATION_MS[action.type];
}
