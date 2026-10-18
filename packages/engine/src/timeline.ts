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
  return easingFn(DEFAULT_EASING[action.type]);
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
    for (const action of step.actions) {
      const ease = actionEase(action);
      // A camera action is one action for all its targets. A wait has no target.
      const targets = action.type === "camera" || (action.type === "wait" && action.targets.length === 0) ? [""] : expand(action.targets);
      const cameraTargets = action.type === "camera" ? expand(action.targets) : undefined;
      const focusTargets = action.type === "emphasis" && action.effect === "focus" ? targets : undefined;
      targets.forEach((target, targetIndex) => {
        const duration = defaultDurationMs(action, labelLength(scene, target));
        const s = startMs + action.delayMs + targetIndex * action.staggerMs;
        const e = s + duration;
        if (target !== "" || action.type === "camera") actions.push({ action, target, targetIndex, startMs: s, endMs: e, ease, ...(focusTargets ? { focusTargets } : {}), ...(cameraTargets ? { cameraTargets } : {}) });
        contentEnd = Math.max(contentEnd, e);
      });
    }

    const endMs = step.durationMs !== undefined ? startMs + step.durationMs : contentEnd;
    const holdEndMs = endMs + step.holdMs;
    steps.push({ id: step.id, index, startMs, endMs, holdEndMs, trigger: step.trigger.kind, actions });
    cursor = holdEndMs;
  });

  // The video lasts until the end of the last audio track, if that is later than the last step.
  let total = cursor;
  for (const t of scene.audio ?? []) total = Math.max(total, trackSpan(t).endMs);
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
