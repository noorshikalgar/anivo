import { type ElementFrame, evaluate, resolveTimeline } from "@anivo/engine";
import { type Polyline, connectorRoutes, frameBox, pointAt } from "@anivo/layout";
import { getIcon, resolveColor, sceneTheme } from "@anivo/render";
import type { ConnectorElement, Element, Scene } from "@anivo/schema";

export type LintLevel = "error" | "warning" | "info";

export interface LintResult {
  code:
    | "overlap"
    | "text-overflow"
    | "off-camera"
    | "camera-crop"
    | "low-contrast"
    | "connector-crosses"
    | "step-empty"
    | "step-overlap"
    | "action-conflict"
    | "unused-element"
    | "dangling-connector"
    | "tiny-text"
    | "too-fast"
    | "unknown-icon"
    | "unknown-color"
    | "script-unmatched"
    | "label-overlap";
  level: LintLevel;
  ids: string[];
  step?: string;
  message: string;
  hint: string;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const area = (b: Box) => Math.max(0, b.width) * Math.max(0, b.height);
function intersection(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function luminance(c: { r: number; g: number; b: number }): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrast(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Does the segment p-q cross the box (shrunk by `pad`)? */
function segmentCrossesBox(p: { x: number; y: number }, q: { x: number; y: number }, b: Box, pad: number): boolean {
  const x0 = b.x + pad;
  const y0 = b.y + pad;
  const x1 = b.x + b.width - pad;
  const y1 = b.y + b.height - pad;
  if (x1 <= x0 || y1 <= y0) return false;
  // Liang-Barsky clipping.
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (pp: number, qq: number) => {
    if (pp === 0) return qq >= 0;
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, p.x - x0) && clip(dx, x1 - p.x) && clip(-dy, p.y - y0) && clip(dy, y1 - p.y) && t0 < t1;
}

const COLOR_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/**
 * Lint a scene (docs/09 "Lint rules"). The checks run on the base state and
 * on the end state of each step. Text width uses an estimate of 0.56 em for
 * each character, so text-overflow is approximate.
 */
export function lintScene(scene: Scene): LintResult[] {
  const out: LintResult[] = [];
  const seen = new Set<string>();
  const add = (r: LintResult) => {
    const key = `${r.code}|${r.ids.join(",")}|${r.step ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };
  const theme = sceneTheme(scene);
  const v = scene.settings.video;
  const camera = scene.settings.camera ?? { x: 0, y: 0, width: v.width, height: v.height };
  const timeline = resolveTimeline(scene);
  const connectors = Object.values(scene.elements).filter((e): e is ConnectorElement => e.type === "connector");
  // The short side is the 1080 of "1080p", also for a portrait (9:16) video.
  const scale1080 = 1080 / Math.min(v.width, v.height);

  // Icon particles of flows.
  for (const st of scene.steps) {
    for (const a of st.actions) {
      if (a.type !== "flow" || a.flow.shape !== "icon") continue;
      const [pack, name] = (a.flow.icon ?? "").split(":");
      if (!a.flow.icon || !pack || !name || !getIcon(pack, name)) {
        add({ code: "unknown-icon", level: "warning", ids: a.targets, step: st.id, message: a.flow.icon ? `The flow particle icon '${a.flow.icon}' does not exist.` : `A flow in step '${st.id}' has shape=icon but no icon.`, hint: "Call anivo_icons_search, then set icon=pack:name on the flow." });
      }
    }
  }

  // Static checks on elements.
  for (const el of Object.values(scene.elements)) {
    if (el.type === "icon" && !getIcon(el.pack, el.name)) {
      add({ code: "unknown-icon", level: "warning", ids: [el.id], message: `The icon '${el.pack}:${el.name}' does not exist.`, hint: "Call anivo_icons_search to find a valid icon name." });
    }
    for (const key of ["fill", "stroke", "textColor"] as const) {
      const c = el.style[key];
      if (c && c !== "default" && c !== "transparent" && !COLOR_RE.test(c) && !(c in theme.tokens)) {
        add({ code: "unknown-color", level: "warning", ids: [el.id], message: `The color '${c}' is not a token of the theme '${theme.name}'.`, hint: `Use one of: ${Object.keys(theme.tokens).join(", ")}, or a hex color.` });
      }
    }
  }

  // Script lines that alignment did not find in the transcript (docs/08 "Alignment").
  const unmatched = scene.script.flatMap((l, i) => (l.unmatched ? [i + 1] : []));
  if (unmatched.length > 0) add({ code: "script-unmatched", level: "warning", ids: [], message: `Script lines ${unmatched.join(", ")} are not in the voiceover transcript. Their steps keep the old start.`, hint: "Make the line text match the spoken words and align again, or set the cue by hand." });

  // Timeline checks.
  for (const w of timeline.warnings) add({ code: "step-overlap", level: "error", ids: [], step: w.stepId, message: w.message, hint: "Make the actions of the previous step shorter, or move the cue later." });
  timeline.steps.forEach((ts, i) => {
    const step = scene.steps[i]!;
    if (step.actions.length === 0) add({ code: "step-empty", level: "warning", ids: [], step: step.id, message: `Step '${step.title || step.id}' has no actions.`, hint: "Add an action, or remove the step." });
    const length = ts.holdEndMs - ts.startMs;
    if (length < 800 && step.actions.length > 3) add({ code: "too-fast", level: "info", ids: [], step: step.id, message: `Step '${step.title || step.id}' has ${step.actions.length} actions in ${length} ms.`, hint: "Give the viewer more time: add hold, or divide the step into two steps." });
    // Two actions that change the same property of the same element at the same time.
    const writes = new Map<string, { id: string; start: number; end: number }[]>();
    for (const ta of ts.actions) {
      const keys = ta.action.type === "morph" ? Object.keys(ta.action.to) : ta.action.type === "enter" || ta.action.type === "exit" ? ["visible"] : [];
      for (const k of keys) {
        const key = `${ta.target}.${k}`;
        const list = writes.get(key) ?? [];
        for (const o of list) {
          if (o.id !== ta.action.id && ta.startMs < o.end && o.start < ta.endMs) {
            add({ code: "action-conflict", level: "warning", ids: [ta.target], step: step.id, message: `Actions '${o.id}' and '${ta.action.id}' change '${k}' of '${ta.target}' at the same time.`, hint: "Remove one action, or give it a delay so the two do not overlap." });
          }
        }
        list.push({ id: ta.action.id, start: ta.startMs, end: ta.endMs });
        writes.set(key, list);
      }
    }
  });

  // Frame checks: the base state and the end of each step.
  const everVisible = new Set<string>();
  const times = [-1, ...timeline.steps.map((s) => s.endMs)];
  times.forEach((t, k) => {
    const stepId = k === 0 ? undefined : scene.steps[k - 1]!.id;
    const where = stepId ? ` at the end of step '${stepId}'` : " before step 1";
    const frame = evaluate(scene, t);
    const byId = new Map(frame.elements.map((f) => [f.id, f]));
    const visible = frame.elements.filter((f) => f.visible && f.opacity > 0.05 && f.type !== "group");
    visible.forEach((f) => everVisible.add(f.id));
    const routes: Map<string, Polyline> = connectorRoutes(connectors, frame.elements);
    const shapes = visible.filter((f) => f.type !== "connector");
    const boxOf = (f: ElementFrame): Box => {
      const b = frameBox(f);
      return { x: b.x, y: b.y, width: b.width, height: b.height + (f.type === "icon" && f.label ? 52 : 0) };
    };
    const ctx = (id: string): Element | undefined => scene.elements[id];

    // overlap
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i]!;
        const b = shapes[j]!;
        const ea = ctx(a.id);
        const eb = ctx(b.id);
        // Parts of one group (for example a widget) are placed on purpose.
        if (!ea || !eb || ea.parentId === b.id || eb.parentId === a.id || (ea.parentId !== undefined && ea.parentId === eb.parentId)) continue;
        const ba = boxOf(a);
        const bb = boxOf(b);
        const inter = intersection(ba, bb);
        const small = Math.min(area(ba), area(bb));
        // A shape fully inside a large background shape is a frame, not an overlap.
        const inside = inter >= small * 0.99 && Math.max(area(ba), area(bb)) > small * 1.25;
        if (small > 0 && inter > small * 0.1 && !inside) {
          add({ code: "overlap", level: "warning", ids: [a.id, b.id], ...(stepId ? { step: stepId } : {}), message: `'${a.id}' and '${b.id}' overlap${where}.`, hint: `Move one of them, for example: element.place with rightOf or below, or use a row or column.` });
        }
      }
    }
    for (const f of visible) {
      const el = ctx(f.id);
      if (!el) continue;
      const b = f.type === "connector" ? routeBox(routes.get(f.id)) : boxOf(f);
      // A moved camera (zoom-to or pan) cuts an element at its edge.
      const cam = frame.camera;
      const moved = Math.abs(cam.x - camera.x) > 1 || Math.abs(cam.y - camera.y) > 1 || Math.abs(cam.width - camera.width) > 1;
      if (b && moved && f.type !== "connector") {
        const seen = intersection(b, cam) / Math.max(1, area(b));
        if (seen > 0.05 && seen < 0.95) {
          add({ code: "camera-crop", level: "warning", ids: [f.id], ...(stepId ? { step: stepId } : {}), message: `The camera cuts '${f.id}' at its edge${where} (${Math.round(seen * 100)}% shows).`, hint: `Zoom to '${f.id}' too, or use a larger padding, or move '${f.id}' away from the zoomed part.` });
        }
      }
      // off-camera
      if (b && (b.x < camera.x - 1 || b.y < camera.y - 1 || b.x + b.width > camera.x + camera.width + 1 || b.y + b.height > camera.y + camera.height + 1)) {
        add({ code: "off-camera", level: "warning", ids: [f.id], ...(stepId ? { step: stepId } : {}), message: `'${f.id}' is outside the camera${where}.`, hint: `Move it inside 0,0 to ${camera.width},${camera.height}, or make the layout smaller.` });
      }
      // text checks
      const text = el.type === "text" ? el.content.text : f.label;
      if (text && text.trim()) {
        const fontSize = f.fontSize ?? el.style.fontSize ?? theme.defaults.fontSize;
        if (fontSize * scale1080 < 24) add({ code: "tiny-text", level: "warning", ids: [f.id], message: `The text of '${f.id}' is ${Math.round(fontSize)} px. It is hard to read in a video.`, hint: "Use a font size of at least 28 px at 1080p." });
        if (el.type !== "text" && el.type !== "connector" && el.type !== "icon") {
          const lines = text.split("\n");
          const longestWord = Math.max(...text.split(/\s+/).map((w) => w.length));
          const maxWidth = f.width - 24;
          const wordWidth = longestWord * fontSize * 0.56;
          const estLines = lines.reduce((s, l) => s + Math.max(1, Math.ceil((l.length * fontSize * 0.56) / Math.max(1, maxWidth))), 0);
          if (wordWidth > maxWidth || estLines * fontSize * 1.25 > f.height + 2) {
            add({ code: "text-overflow", level: "error", ids: [f.id], ...(stepId ? { step: stepId } : {}), message: `The label of '${f.id}' does not fit inside it${where}.`, hint: `Make '${f.id}' larger (about ${Math.ceil(Math.max(wordWidth + 24, f.width))} x ${Math.ceil(estLines * fontSize * 1.25 + 16)}), or use a shorter label.` });
          }
        }
        // low-contrast: text on its shape fill, or on the background.
        const textColor = resolveColor(theme, f.textColor, "textColor", el.type);
        let bg = resolveColor(theme, f.fill, "fill", el.type);
        if (bg.a < 0.5 || el.type === "text" || el.type === "icon" || el.type === "connector") bg = resolveColor(theme, scene.settings.background.color ?? "background", "fill", "rectangle");
        // Large text (WCAG): 40 px, or 32 px bold, at 1080p needs 3:1.
        const px = fontSize * scale1080;
        const bold = Number(el.style.fontWeight ?? 400) >= 700;
        const need = px >= 40 || (bold && px >= 32) ? 3 : 4.5;
        if (contrast(textColor, bg) < need) {
          add({ code: "low-contrast", level: "warning", ids: [f.id], ...(stepId ? { step: stepId } : {}), message: `The text of '${f.id}' has low contrast${where} (${contrast(textColor, bg).toFixed(1)}:1).`, hint: `Use a text color with a contrast of at least ${need}:1, for example 'text' on 'surface'.` });
        }
      }
      // dangling connector
      if (el.type === "connector") {
        for (const e of [el.start, el.end]) {
          if (e.kind !== "bound") continue;
          const target = byId.get(e.elementId);
          if (target && !target.visible) {
            add({ code: "dangling-connector", level: "warning", ids: [f.id, e.elementId], ...(stepId ? { step: stepId } : {}), message: `Arrow '${f.id}' is visible, but '${e.elementId}' is not${where}.`, hint: `Make '${f.id}' enter in the same step as '${e.elementId}' or later.` });
          }
        }
        // connector-crosses: the route passes through a shape that it does not connect.
        const route = routes.get(f.id);
        const ends = new Set([el.start, el.end].flatMap((e) => (e.kind === "bound" ? [e.elementId] : [])));
        if (route) {
          for (const s of shapes) {
            if (ends.has(s.id) || s.type === "text") continue;
            const sb = boxOf(s);
            const crosses = route.points.some((p, i) => i > 0 && segmentCrossesBox(route.points[i - 1]!, p, sb, 6));
            if (crosses) add({ code: "connector-crosses", level: "info", ids: [f.id, s.id], message: `Arrow '${f.id}' passes through '${s.id}'.`, hint: `Move '${s.id}', or use route=elbow or a waypoint.` });
          }
          // label-overlap: the label at the middle of the arrow covers an element (also its own ends).
          const label = f.label ?? el.label?.text;
          if (label) {
            const size = f.fontSize ?? el.style.fontSize ?? 20;
            const longest = Math.max(...label.split("\n").map((l) => l.length));
            const w = Math.min(320, longest * size * 0.56) + 16;
            const h = label.split("\n").length * size * 1.3 + 8;
            const mid = pointAt(route, route.length / 2).point;
            const lb = { x: mid.x - w / 2, y: mid.y - h / 2, width: w, height: h };
            for (const s of shapes) {
              const sb = boxOf(s);
              if (lb.x < sb.x + sb.width && lb.x + lb.width > sb.x && lb.y < sb.y + sb.height && lb.y + lb.height > sb.y) {
                add({ code: "label-overlap", level: "warning", ids: [f.id, s.id], ...(stepId ? { step: stepId } : {}), message: `The label of arrow '${f.id}' covers '${s.id}'${where}.`, hint: `Make the label shorter, or move the elements apart (about ${Math.ceil(w + 40)} px of line is needed).` });
              }
            }
          }
        }
      }
    }
  });

  for (const el of Object.values(scene.elements)) {
    if (el.type === "group") continue;
    if (!everVisible.has(el.id)) add({ code: "unused-element", level: "info", ids: [el.id], message: `'${el.id}' never shows in the video.`, hint: `Add an enter action for '${el.id}', or remove it.` });
  }

  const order: Record<LintLevel, number> = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

function routeBox(route: Polyline | undefined): Box | undefined {
  if (!route || route.points.length === 0) return undefined;
  const xs = route.points.map((p) => p.x);
  const ys = route.points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** One line for each result, for agents and the CLI. */
export function formatLint(results: LintResult[]): string {
  if (results.length === 0) return "No problems.";
  return results.map((r) => `${r.level.toUpperCase()} ${r.code}${r.step ? ` [${r.step}]` : ""}: ${r.message} ${r.hint}`).join("\n");
}

/** Counts for a short summary. */
export function lintSummary(results: LintResult[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: results.filter((r) => r.level === "error").length,
    warnings: results.filter((r) => r.level === "warning").length,
    infos: results.filter((r) => r.level === "info").length,
  };
}
