import { type Action, type Scene, DEFAULT_EASING, defaultDurationMs, trackSpan } from "@anivo/schema";
import { type EaseFn, easingFn } from "./easing.js";

/** One action for one target, with absolute times. */
export interface TimedAction {
  action: Action;
  target: string;
  /** Index of the target in `action.targets`. Used by flow round-robin. */
  targetIndex: number;
  startMs: number;
  endMs: number;
  ease: EaseFn;
  /** For a focus action: all targets after group expansion. */
  focusTargets?: string[];
  /** For a camera action: the elements to fit, after group expansion. */
  cameraTargets?: string[];
  /** For a circle or spotlight on a group: all parts of the group. The first part carries the mark for the whole group. */
  groupParts?: string[];
  /** For a motion of a group: the place of this part from the center of the group, so the group moves as one. */
  moveOffset?: { dx: number; dy: number };
}

export interface TimedStep {
  id: string;
  index: number;
  startMs: number;
  /** End of the step content. The hold starts here. */
  endMs: number;
  /** End of the hold. The next step starts here or later. */
  holdEndMs: number;
  trigger: Scene["steps"][number]["trigger"]["kind"];
  actions: TimedAction[];
  /** The step caption times, if the step has a caption. */
  caption?: { startMs: number; typedMs: number; readEndMs: number };
}

/**
 * Caption timing (docs/17 P4): it types at about 28 characters each second (at
 * most 2 s), then it stays for reading: 0.45 s for each word, minimum 2.5 s.
 */
export function captionTiming(text: string, pace: "relaxed" | "normal" | "quick" = "relaxed"): { typeMs: number; readMs: number } {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const perWord = pace === "quick" ? 250 : pace === "normal" ? 330 : 450;
  const min = pace === "quick" ? 1500 : pace === "normal" ? 2000 : 2500;
  return { typeMs: Math.min(2000, Math.round(text.length * 35)), readMs: Math.max(min, words * perWord) };
}

export interface TimelineWarning {
  code: "step-overlap";
  stepId: string;
  message: string;
}

export interface Timeline {
  steps: TimedStep[];
  totalMs: number;
  warnings: TimelineWarning[];
}

/** Ease for an action: its own easing, or the default for its effect and type. */
function actionEase(action: Action): EaseFn {
  if (action.easing !== undefined) return easingFn(action.easing);
  if (action.type === "enter" && action.effect === "pop") return easingFn("back-out");
  if ((action.type === "enter" || action.type === "exit") && (action.effect === "rise" || action.effect === "blur")) return easingFn("smooth");
  return easingFn(DEFAULT_EASING[action.type]);
}

/**
 * The place of each target in the stagger (docs/21 C6): in order, reverse,
 * from the center out, from both ends in, or a shuffle that is the same each
 * time (from the action ID).
 */
export function staggerRanks(n: number, order: string | undefined, seed: string): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  if (!order || order === "in-order") return idx;
  if (order === "reverse") return idx.map((i) => n - 1 - i);
  const mid = (n - 1) / 2;
  if (order === "center" || order === "edges") {
    // Rank by the distance from the middle; targets at the same distance start together.
    const dist = idx.map((i) => Math.abs(i - mid));
    const levels = [...new Set(dist)].sort((a, b) => (order === "center" ? a - b : b - a));
    return dist.map((d) => levels.indexOf(d));
  }
  // random: a seeded shuffle.
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const order2 = [...idx];
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ i;
    const j = (h >>> 0) % (i + 1);
    [order2[i], order2[j]] = [order2[j]!, order2[i]!];
  }
  const rank = new Array<number>(n);
  order2.forEach((t, r) => (rank[t] = r));
  return rank;
}

/** Idle motion (docs/22 D6): it runs while the step holds and does not set the step length. */
function isIdle(a: Action): boolean {
  return a.type === "emphasis" && (a.effect === "float" || a.effect === "breathe");
}

function labelLength(scene: Scene, id: string): number {
  const el = scene.elements[id];
  if (!el) return 0;
  if (el.type === "text") return el.content.text.length;
  return el.label?.text.length ?? 0;
}

/**
 * Convert steps into absolute times (docs/06 "Stage 1"). Run once for each
 * scene change, not for each frame.
 */
export function resolveTimeline(scene: Scene): Timeline {
  // An action on a group applies to all elements in the group.
  const children = new Map<string, string[]>();
  for (const el of Object.values(scene.elements)) {
    if (el.parentId === undefined) continue;
    const list = children.get(el.parentId) ?? [];
    list.push(el.id);
    children.set(el.parentId, list);
  }
  const expand = (ids: string[]): string[] => {
    const out: string[] = [];
    const visit = (id: string) => {
      const kids = children.get(id);
      const type = scene.elements[id]?.type;
      if (type === "group") kids?.forEach(visit);
      else if (type === "table") {
        // A table is its grid and its cells.
        out.push(id);
        kids?.forEach(visit);
      } else out.push(id);
    };
    ids.forEach(visit);
    return out;
  };
  const steps: TimedStep[] = [];
  const warnings: TimelineWarning[] = [];
  let cursor = 0;

  scene.steps.forEach((step, index) => {
    let startMs = cursor;
    if (step.trigger.kind === "cue") {
      if (step.trigger.atMs < cursor) {
        warnings.push({
          code: "step-overlap",
          stepId: step.id,
          message: `Step '${step.id}' starts at its cue (${step.trigger.atMs} ms) before the previous step ends (${cursor} ms). Make the previous step shorter, or move the cue.`,
        });
      } else {
        startMs = step.trigger.atMs;
      }
    }

    const actions: TimedAction[] = [];
    let contentEnd = startMs;
    // Chains (docs/21 C7): an action with `after` starts when that action ends.
    const byId = new Map(step.actions.map((a) => [a.id, a]));
    const bases = new Map<string, number>();
    const visiting = new Set<string>();
    const endOf = (a: Action): number => {
      const targets = a.type === "camera" || (a.type === "wait" && a.targets.length === 0) ? [""] : expand(a.targets);
      let longest = 0;
      for (const t of targets) longest = Math.max(longest, defaultDurationMs(a, labelLength(scene, t)));
      // The last start: the highest rank of the named targets (from the center has fewer ranks than targets).
      const lastRank = Math.max(0, ...staggerRanks(Math.max(1, a.targets.length), a.staggerOrder, a.id));
      return baseOf(a) + a.delayMs + lastRank * a.staggerMs + longest;
    };
    const baseOf = (a: Action): number => {
      const known = bases.get(a.id);
      if (known !== undefined) return known;
      const ref = a.after !== undefined ? byId.get(a.after) : undefined;
      // A chain that comes back to itself starts at the step start.
      if (!ref || visiting.has(a.id)) return startMs;
      visiting.add(a.id);
      const b = endOf(ref);
      visiting.delete(a.id);
      bases.set(a.id, b);
      return b;
    };
    const onlyIdle = step.actions.every(isIdle);
    for (const action of step.actions) {
      const ease = actionEase(action);
      // A camera action is one action for all its targets. A wait has no target.
      const single = action.type === "camera" || (action.type === "wait" && action.targets.length === 0);
      // The stagger is for each target that the action names: the parts of a group start together (audit e1).
      const origin: number[] = [];
      const targets = single ? [""] : action.targets.flatMap((t, i) => expand([t]).map((leaf) => (origin.push(i), leaf)));
      const cameraTargets = action.type === "camera" ? expand(action.targets) : undefined;
      const focusTargets = action.type === "emphasis" && action.effect === "focus" ? targets : undefined;
      const named = staggerRanks(single ? 1 : action.targets.length, action.staggerOrder, action.id);
      const rank = targets.map((_, j) => named[origin[j] ?? 0] ?? 0);
      // A group that moves along a path keeps its shape: each part keeps its place from the group center.
      const offsets = new Map<string, { dx: number; dy: number }>();
      if (action.type === "motion") {
        for (const t of action.targets) {
          if (scene.elements[t]?.type !== "group") continue;
          const parts = expand([t])
            .map((id) => scene.elements[id])
            .filter((e): e is Exclude<typeof e, undefined> => !!e && e.type !== "connector" && e.type !== "group");
          if (parts.length === 0) continue;
          const b = parts as unknown as { id: string; x: number; y: number; width: number; height: number }[];
          const cx = (Math.min(...b.map((e) => e.x)) + Math.max(...b.map((e) => e.x + e.width))) / 2;
          const cy = (Math.min(...b.map((e) => e.y)) + Math.max(...b.map((e) => e.y + e.height))) / 2;
          for (const e of b) offsets.set(e.id, { dx: e.x + e.width / 2 - cx, dy: e.y + e.height / 2 - cy });
        }
      }
      targets.forEach((target, targetIndex) => {
        const duration = defaultDurationMs(action, labelLength(scene, target));
        const s = baseOf(action) + action.delayMs + rank[targetIndex]! * action.staggerMs;
        const e = s + duration;
        const moveOffset = offsets.get(target);
        const parts = action.type === "emphasis" && (action.effect === "circle" || action.effect === "spotlight") && scene.elements[action.targets[origin[targetIndex] ?? 0] ?? ""]?.type === "group" ? targets.filter((_, j) => origin[j] === origin[targetIndex]) : undefined;
        if (target !== "" || action.type === "camera") actions.push({ action, target, targetIndex, startMs: s, endMs: e, ease, ...(focusTargets ? { focusTargets } : {}), ...(cameraTargets ? { cameraTargets } : {}), ...(moveOffset ? { moveOffset } : {}), ...(parts ? { groupParts: parts } : {}) });
        // Idle motion (float, breathe) fills the hold; it does not make the step longer (unless the step has only idle motion).
        if (!isIdle(action) || onlyIdle) contentEnd = Math.max(contentEnd, e);
      });
    }

    const endMs = step.durationMs !== undefined ? startMs + step.durationMs : contentEnd;
    let holdEndMs = endMs + step.holdMs;
    let caption: TimedStep["caption"];
    if (step.caption) {
      // The step holds until a viewer can read the caption.
      const c = captionTiming(step.caption.text, scene.settings.captionPace);
      caption = { startMs, typedMs: startMs + c.typeMs, readEndMs: startMs + c.typeMs + c.readMs };
      holdEndMs = Math.max(holdEndMs, caption.readEndMs);
    }
    // Idle motion stops softly at the end of the hold.
    for (const ta of actions) if (isIdle(ta.action) && ta.endMs > holdEndMs) ta.endMs = Math.max(ta.startMs + 1, holdEndMs);
    steps.push({ id: step.id, index, startMs, endMs, holdEndMs, trigger: step.trigger.kind, actions, ...(caption ? { caption } : {}) });
    cursor = holdEndMs;
  });

  // The video lasts until the end of the last audio track, if that is later than the last step.
  let total = cursor;
  for (const t of scene.audio ?? []) total = Math.max(total, trackSpan(t).endMs);
  // Element keyframes are on the video time (docs/32): the video lasts until the last key.
  for (const el of Object.values(scene.elements)) for (const keys of Object.values(el.keys ?? {})) for (const k of keys ?? []) total = Math.max(total, k.t);
  return { steps, totalMs: total, warnings };
}

/** Index of the step that contains `timeMs`, or -1 if `timeMs` is before step 0. Binary search. */
export function stepIndexAt(timeline: Timeline, timeMs: number): number {
  let lo = 0;
  let hi = timeline.steps.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline.steps[mid]!.startMs <= timeMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
