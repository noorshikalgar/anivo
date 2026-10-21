/**
 * Layers (docs/17 P5): the times that each element is on the screen, from
 * its enter actions to its exit actions. The timeline shows one bar for each
 * span, like the in and out points of a layer in a video editor.
 */
import { type Timeline, prepare } from "@anivo/engine";
import type { Scene } from "@anivo/schema";

export interface SpanEnd {
  stepId: string;
  actionId: string;
  startMs: number;
  endMs: number;
  /** The start of the step of the action. */
  stepStartMs: number;
  delayMs: number;
}

export interface Span {
  startMs: number;
  endMs: number;
  /** The enter action at the start. None: visible in the base state. */
  enter?: SpanEnd;
  /** The exit action at the end. None: visible until the end. */
  exit?: SpanEnd;
}

export function layerSpans(scene: Scene, timeline: Timeline): { id: string; spans: Span[] }[] {
  const base = prepare(scene).base;
  const ends = new Map<string, { kind: "enter" | "exit"; end: SpanEnd }[]>();
  for (const ts of timeline.steps) {
    const step = scene.steps[ts.index]!;
    for (const ta of ts.actions) {
      if (ta.action.type !== "enter" && ta.action.type !== "exit") continue;
      const list = ends.get(ta.target) ?? [];
      list.push({ kind: ta.action.type, end: { stepId: step.id, actionId: ta.action.id, startMs: ta.startMs, endMs: ta.endMs, stepStartMs: ts.startMs, delayMs: ta.action.delayMs } });
      ends.set(ta.target, list);
    }
  }
  const out: { id: string; spans: Span[] }[] = [];
  const els = Object.values(scene.elements)
    .filter((e) => e.type !== "group")
    .sort((a, b) => (a.z < b.z ? 1 : a.z > b.z ? -1 : 0));
  for (const el of els) {
    const spans: Span[] = [];
    let open: Span | null = base[el.id]?.visible ? { startMs: 0, endMs: timeline.totalMs } : null;
    for (const e of (ends.get(el.id) ?? []).sort((a, b) => a.end.startMs - b.end.startMs)) {
      if (e.kind === "enter" && !open) open = { startMs: e.end.startMs, endMs: timeline.totalMs, enter: e.end };
      else if (e.kind === "exit" && open) {
        spans.push({ ...open, endMs: e.end.endMs, exit: e.end });
        open = null;
      }
    }
    if (open) spans.push(open);
    out.push({ id: el.id, spans });
  }
  return out;
}
