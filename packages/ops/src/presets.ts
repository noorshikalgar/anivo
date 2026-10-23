/**
 * Motion presets (docs/20 B5): ready-made animations that a user applies to
 * the selection in one click, and animations that a user saves to use again.
 *
 * - "each" presets: the same actions for each target, one after the other
 *   (stagger), for example Rise in.
 * - "roles" presets: a small choreography of many elements. Role 0 is the
 *   first selected element, role 1 the second, and so on.
 */
import type { Action, Scene } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

/** An action without its ID and targets. */
export type ActionTemplate = Record<string, unknown> & { type: Action["type"]; delayMs?: number };

export interface MotionPreset {
  id: string;
  name: string;
  description: string;
  /** each: the actions for each target; roles: actions with the roles of their targets. */
  mode: "each" | "roles";
  actions: { roles?: number[]; action: ActionTemplate }[];
  /** each: the time between targets. */
  staggerMs?: number;
  /** Built-in presets that need the elements (for example the number of a text). */
  make?: (scene: Scene, id: string) => ActionTemplate[] | undefined;
}

const each = (id: string, name: string, description: string, actions: ActionTemplate[], staggerMs = 120): MotionPreset => ({ id, name, description, mode: "each", actions: actions.map((action) => ({ action })), staggerMs });

const labelOf = (scene: Scene, id: string): string => {
  const el = scene.elements[id];
  if (!el) return "";
  if (el.type === "text") return el.content.text;
  return "label" in el && el.label ? el.label.text : "";
};

export const BUILTIN_PRESETS: MotionPreset[] = [
  each("rise-in", "Rise in", "Up into place with a fade and a soft landing.", [{ type: "enter", effect: "rise", durationMs: 700 }]),
  each("blur-in", "Blur in", "Comes into focus.", [{ type: "enter", effect: "blur", durationMs: 700 }]),
  each("pop-in", "Pop in", "Grows in with a small bounce.", [{ type: "enter", effect: "pop", durationMs: 450 }]),
  each("card-up", "Card slides up", "A card rises a short way, as a popover.", [{ type: "enter", effect: "rise", durationMs: 550, params: { distance: 24 } }]),
  each("words-in", "Words in", "The text appears one word at a time.", [{ type: "enter", effect: "typewriter", params: { unit: "word" } }]),
  each("letters-in", "Letters cascade", "Each letter rises in after the one before.", [{ type: "enter", effect: "cascade", durationMs: 900, easing: "linear" }]),
  each("decode", "Decode", "Random letters settle into the text.", [{ type: "enter", effect: "scramble", durationMs: 1000, easing: "linear" }]),
  each("type-in", "Type in", "The text types letter by letter.", [{ type: "enter", effect: "typewriter", sound: "keys" }]),
  each("draw-in", "Draw in", "The outline draws, then the fill comes in.", [{ type: "enter", effect: "draw-on" }]),
  each("fill-up", "Fill up", "Fills from the bottom up, as a meter.", [{ type: "enter", effect: "wipe", durationMs: 900, easing: "smooth", params: { direction: "up" } }]),
  each("fill-right", "Fill to the right", "Fills from the left, as a progress bar or a slider.", [{ type: "enter", effect: "wipe", durationMs: 800, easing: "smooth", params: { direction: "right" } }]),
  each("emphasize", "Emphasize", "A short pulse to point at it.", [{ type: "emphasis", effect: "pulse", params: { count: 1 } }], 200),
  each("no", "Shake (no)", "A short shake: wrong, or not allowed.", [{ type: "emphasis", effect: "shake" }], 200),
  each("sink-out", "Sink out", "Down and out with a fade.", [{ type: "exit", effect: "rise", durationMs: 450 }], 80),
  each("fade-out", "Fade out", "Fades away.", [{ type: "exit", effect: "fade" }], 80),
  {
    id: "count-up",
    name: "Count up",
    description: "The number in the text counts up from 0.",
    mode: "each",
    actions: [],
    staggerMs: 150,
    make: (scene, id) => {
      const text = labelOf(scene, id);
      // 12,400 counts with thousands; 12.4K counts in the short style.
      const g = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?/.exec(text);
      const m = g ?? /-?\d+(?:[.,]\d+)?[KMB]?/.exec(text);
      if (!m) return undefined;
      const unit = { K: 1e3, M: 1e6, B: 1e9 }[m[0].slice(-1)] ?? 1;
      const digits = unit > 1 ? m[0].slice(0, -1) : m[0];
      const to = Number(g ? digits.replace(/,/g, "") : digits.replace(",", ".")) * unit;
      const decimals = (digits.split(g ? "." : /[.,]/)[1] ?? "").length;
      const style = g ? "thousands" : unit > 1 ? "compact" : undefined;
      return [{ type: "counter", durationMs: 1400, counter: { from: 0, to, decimals, ...(style ? { style } : {}), format: text.slice(0, m.index) + "{n}" + text.slice(m.index + m[0].length) } }];
    },
  },
];

export function getPreset(id: string): MotionPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}

export interface PresetOptions {
  /** A delay before the first action of the preset, in ms. */
  delayMs?: number;
  /** Override the stagger of an each preset. */
  staggerMs?: number;
}

/** The actions that apply a preset to targets in a step. Error text if the preset cannot apply. */
export function presetOps(scene: Scene, stepId: string, preset: MotionPreset, targets: string[], o: PresetOptions = {}): OperationInput[] | { error: string } {
  if (!scene.steps.some((s) => s.id === stepId)) return { error: "Select a step first." };
  if (targets.length === 0) return { error: "Select the elements first." };
  const base = o.delayMs ?? 0;
  const ops: OperationInput[] = [];
  const add = (a: ActionTemplate, ids: string[], extra: number) =>
    ops.push({ op: "action.add", step: stepId, action: { ...a, targets: ids, delayMs: base + extra + ((a.delayMs as number | undefined) ?? 0) } });
  if (preset.mode === "each") {
    const stagger = o.staggerMs ?? preset.staggerMs ?? 120;
    targets.forEach((id, i) => {
      const list = preset.make ? preset.make(scene, id) : preset.actions.map((x) => x.action);
      for (const a of list ?? []) add(a, [id], i * stagger);
    });
    if (ops.length === 0) return { error: `${preset.name} does not fit these elements.` };
    return ops;
  }
  const roles = Math.max(0, ...preset.actions.flatMap((x) => x.roles ?? [0])) + 1;
  if (targets.length < roles) return { error: `${preset.name} needs ${roles} elements. Select ${roles} elements, in order.` };
  for (const x of preset.actions) add(x.action, (x.roles ?? [0]).map((r) => targets[r]!), 0);
  return ops;
}

/**
 * Save actions of a step as a preset. Each different target becomes a role,
 * in the order of the actions. Times are kept, from the earliest delay.
 */
export function capturePreset(scene: Scene, stepId: string, actionIds: string[], name: string, id: string): MotionPreset | { error: string } {
  const step = scene.steps.find((s) => s.id === stepId);
  const picked = step?.actions.filter((a) => actionIds.includes(a.id)) ?? [];
  if (picked.length === 0) return { error: "Choose one or more actions to save." };
  const roleOf = new Map<string, number>();
  for (const a of picked) for (const t of a.targets) if (!roleOf.has(t)) roleOf.set(t, roleOf.size);
  const t0 = Math.min(...picked.map((a) => a.delayMs));
  const actions = picked.map((a) => {
    const { id: _id, targets, delayMs, ...rest } = a;
    void _id;
    return { roles: targets.map((t) => roleOf.get(t)!), action: { ...rest, delayMs: delayMs - t0 } as ActionTemplate };
  });
  const roles = roleOf.size;
  // One element: the preset applies to each selected element.
  if (roles <= 1) return { id, name, description: `${picked.length} action${picked.length > 1 ? "s" : ""}`, mode: "each", actions: actions.map((x) => ({ action: x.action })), staggerMs: 120 };
  return { id, name, description: `${roles} elements, ${picked.length} actions`, mode: "roles", actions };
}
