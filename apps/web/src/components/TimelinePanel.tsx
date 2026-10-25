/**
 * The timeline (docs/18 T1, T2): one ruler for the whole video. Steps are
 * sections on the ruler. Each element has one row with its life bar (on the
 * screen), its action blocks, and its keys. Unfold a row to see a row for
 * each keyed property. Record (K) makes keys at the playhead.
 */
import { Popover, PopoverSurface, PopoverTrigger, Tooltip, makeStyles, mergeClasses } from "@fluentui/react-components";
import { easingFn, stepIndexAt } from "@anivo/engine";
import { type Keyframe, type OperationInput, keyframesIn, setElementKeysOps } from "@anivo/ops";
import { type Action, type Easing, EasingName, type Scene } from "@anivo/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Delete16Regular } from "@fluentui/react-icons";
import { addAction, removeAction, updateAction } from "../commands.js";
import { layerSpans } from "../layers.js";
import { setAreas, useEditor } from "../store.js";
import { TOOLS_LEFT, TOOLS_RIGHT, formatTime } from "./PlaybackBar.js";
import { KEY_PROPS, deleteKeyOps, easeKeyOps, easeOfKey, elementTimelineKeys, isElementKey, moveKeyOps } from "../keys.js";
import { ScrubPreview } from "./ScrubPreview.js";
import { describe } from "./StepInspector.js";
import { actionIcon, elementIcon } from "./typeIcons.js";
import { CurveEditor } from "./CurveEditor.js";
import { Splitter } from "./ui.js";

const LABEL_W = 200;
const ROW_H = 28;
const MIN_MS = 50;
/** Time after the end that the ruler shows, so a key can make the last step longer. */
const TAIL_MS = 3000;
const TRACK_PAD = 10;

const COLORS: Record<string, string> = { enter: "#1d4ed8", exit: "#475569", emphasis: "#b45309", motion: "#0f766e", flow: "#15803d", counter: "#7e22ce", code: "#be185d", camera: "#0369a1", morph: "#6d28d9", wait: "#334155" };

const useStyles = makeStyles({
  root: { position: "relative", display: "flex", flexDirection: "column", backgroundColor: "var(--ui-list)", color: "var(--ui-text)", minHeight: 0, fontSize: "12px" },
  bar: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  group: { display: "flex", gap: "2px" },
  btn: {
    border: "none",
    borderRadius: "3px",
    padding: "1px 7px",
    fontSize: "11px",
    cursor: "pointer",
    color: "var(--ui-text)",
    backgroundColor: "var(--ui-widget)",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
    ":disabled": { opacity: 0.5, cursor: "default" },
  },
  rec: { display: "inline-flex", alignItems: "center", gap: "4px" },
  btnOn: { backgroundColor: "var(--ui-select) !important", color: "#fff" },
  recOn: { backgroundColor: "#e5484d !important", color: "#fff" },
  recDot: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--ui-muted)" },
  recDotOn: { backgroundColor: "#fff" },
  select: { height: "20px", fontSize: "11px", backgroundColor: "var(--ui-field)", color: "var(--ui-text)", border: "1px solid var(--ui-outline)", borderRadius: "3px" },
  scroll: { position: "relative", flexGrow: 1, overflow: "auto", minHeight: 0 },
  ruler: { position: "sticky", top: 0, zIndex: 3, display: "flex", height: "40px", backgroundColor: "var(--ui-region)", borderBottom: "1px solid var(--ui-line)" },
  corner: { position: "sticky", left: 0, zIndex: 4, width: `${LABEL_W}px`, flexShrink: 0, boxSizing: "border-box", padding: "4px 8px", backgroundColor: "var(--ui-region)", borderRight: "1px solid var(--ui-line)", color: "var(--ui-muted)", display: "flex", alignItems: "flex-end" },
  rulerTrack: { position: "relative", flexShrink: 0, cursor: "pointer" },
  section: { position: "absolute", top: 0, height: "18px", boxSizing: "border-box", padding: "0 6px", fontSize: "11px", lineHeight: "18px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", borderLeft: "1px solid var(--ui-outline)", cursor: "pointer", ":hover": { backgroundColor: "var(--ui-hover)" } },
  sectionOn: { backgroundColor: "var(--ui-select)", color: "#fff" },
  tick: { position: "absolute", top: "18px", bottom: 0, borderLeft: "1px solid var(--ui-outline)", paddingLeft: "3px", fontSize: "10px", lineHeight: "22px", color: "var(--ui-muted)", pointerEvents: "none" },
  row: { position: "relative", display: "flex", height: `${ROW_H}px` },
  rowSel: { backgroundColor: "var(--ui-row-selected)", "--ui-muted": "var(--ui-muted-on-select)" } as never,
  label: { position: "sticky", left: 0, zIndex: 2, width: `${LABEL_W}px`, flexShrink: 0, boxSizing: "border-box", padding: "0 6px", display: "flex", alignItems: "center", gap: "5px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", borderRight: "1px solid var(--ui-line)", borderBottom: "1px solid var(--ui-list-alt)", cursor: "pointer" },
  labelBg: { backgroundColor: "var(--ui-list)" },
  labelSel: { backgroundColor: "var(--ui-row-selected)" },
  twirl: { width: "14px", flexShrink: 0, border: "none", background: "none", color: "var(--ui-muted)", cursor: "pointer", padding: 0, fontSize: "10px" },
  icon: { display: "flex", color: "var(--ui-muted)", flexShrink: 0 },
  track: { position: "relative", flexShrink: 0, height: "100%", borderBottom: "1px solid var(--ui-list-alt)", boxSizing: "border-box" },
  life: { position: "absolute", top: "9px", height: "6px", borderRadius: "3px", backgroundColor: "var(--ui-outline)", opacity: 0.6, pointerEvents: "none" },
  /** A chained action: a light bar at its start, joined to the end of the action before it. */
  chain: { position: "absolute", left: "0", top: "0", bottom: "0", width: "3px", backgroundColor: "rgba(255,255,255,0.85)", borderRadius: "3px 0 0 3px", pointerEvents: "none" },
  block: {
    position: "absolute",
    top: "3px",
    bottom: "3px",
    minWidth: "6px",
    boxSizing: "border-box",
    borderRadius: "4px",
    padding: "0 5px",
    color: "#fff",
    fontSize: "10px",
    lineHeight: "21px",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
    cursor: "grab",
    touchAction: "none",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
    ":focus-visible": { outline: "2px solid #fff" },
  },
  blockOn: { boxShadow: "0 0 0 2px #fff" },
  /** The bar that the active bar follows (a chain). */
  blockLead: { outline: "1px dashed rgba(255,255,255,0.9)", outlineOffset: "1px" },
  edge: { position: "absolute", top: 0, bottom: 0, right: "-3px", width: "7px", cursor: "ew-resize" },
  edgeStart: { position: "absolute", top: 0, bottom: 0, left: "-3px", width: "7px", cursor: "ew-resize" },
  ctx: { position: "fixed", zIndex: 40, minWidth: "170px", padding: "4px", borderRadius: "6px", backgroundColor: "var(--ui-menu)", boxShadow: "0 8px 24px rgba(0,0,0,.4)", border: "1px solid var(--ui-line)", display: "flex", flexDirection: "column" },
  ctxItem: { textAlign: "left", padding: "6px 10px", border: "none", background: "transparent", color: "var(--ui-text)", font: "inherit", fontSize: "12px", borderRadius: "4px", cursor: "pointer", ":hover": { backgroundColor: "var(--ui-hover)" } },
  diamond: {
    position: "absolute",
    top: "6px",
    width: "11px",
    height: "11px",
    marginLeft: "-6px",
    transform: "rotate(45deg)",
    backgroundColor: "#f5b84a",
    border: "1px solid rgba(0,0,0,0.45)",
    borderRadius: "2px",
    cursor: "grab",
    touchAction: "none",
    zIndex: 1,
    ":focus-visible": { outline: "2px solid #fff" },
  },
  diamondOn: { backgroundColor: "#fff" },
  tween: { position: "absolute", top: "11px", height: "2px", backgroundColor: "#f5b84a", opacity: 0.5, pointerEvents: "none" },
  boundary: { position: "absolute", top: 0, bottom: 0, width: "1px", backgroundColor: "var(--ui-outline)", opacity: 0.5, pointerEvents: "none" },
  boxSel: { position: "absolute", border: "1px dashed #f5b84a", backgroundColor: "rgba(245, 184, 74, 0.1)", pointerEvents: "none", zIndex: 5 },
  loopBand: { position: "absolute", top: "18px", bottom: 0, backgroundColor: "rgba(59, 130, 246, 0.10)", borderLeft: "2px solid #3b82f6", borderRight: "2px solid #3b82f6", pointerEvents: "none", zIndex: 1 },
  hoverLine: { position: "absolute", top: 0, bottom: 0, width: "1px", backgroundColor: "var(--ui-text)", opacity: 0.25, pointerEvents: "none", zIndex: 2 },
  hoverTag: { position: "absolute", top: "20px", transform: "translateX(-50%)", padding: "0 4px", fontSize: "10px", lineHeight: "16px", borderRadius: "3px", backgroundColor: "var(--ui-widget)", color: "var(--ui-text)", pointerEvents: "none", zIndex: 3, whiteSpace: "nowrap" },
  playTag: { position: "absolute", top: "20px", transform: "translateX(-50%)", padding: "0 4px", fontSize: "10px", lineHeight: "16px", borderRadius: "3px", backgroundColor: "#C4282F", color: "#fff", pointerEvents: "none", zIndex: 4, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  playhead: { position: "absolute", top: 0, bottom: 0, width: "2px", marginLeft: "-1px", backgroundColor: "#e5484d", pointerEvents: "none", zIndex: 2 },
  empty: { padding: "12px", color: "var(--ui-muted)" },
});

/** Ticks every 0.1, 0.25, 0.5, 1, 2, 5 ... seconds, at least 60 px apart. */
function tickStep(pxPerMs: number): number {
  for (const s of [100, 250, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000]) if (s * pxPerMs >= 60) return s;
  return 120_000;
}

const GROUP_NAMES: Record<string, string> = { position: "Position", size: "Size", opacity: "Opacity", rotation: "Rotation", fill: "Fill", stroke: "Stroke", strokeWidth: "Stroke width", textColor: "Text color", fontSize: "Font size", cornerRadius: "Corner radius", label: "Label", shape: "Shape" };

interface Block {
  key: string;
  stepId: string;
  stepIndex: number;
  action: Action;
  startMs: number;
  endMs: number;
}

interface GlobalKey extends Keyframe {
  /** Global time of the key, and of the start of its tween. */
  atMs: number;
  fromAtMs: number;
}

type Drag = { kind: "move" | "start" | "end" | "key" | "scale"; key: string; dms: number };

/** A small preview of an easing curve: time to the right, value up. */
function EaseCurve({ value }: { value: Easing }) {
  const fn = easingFn(value);
  const pts = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    return `${(2 + t * 40).toFixed(1)},${(18 - fn(t) * 14).toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="44" height="20" viewBox="0 0 44 20" aria-hidden>
      <line x1="2" y1="18" x2="42" y2="18" stroke="var(--ui-outline)" />
      <polyline points={pts} fill="none" stroke="#f5b84a" strokeWidth="1.6" />
    </svg>
  );
}

export function TimelinePanel() {
  const styles = useStyles();
  const areaH = useEditor((s) => s.areas.timeline);
  const startH = useRef(areaH);
  const scene = useEditor((s) => s.scene);
  const timeline = useEditor((s) => s.timeline);
  const playhead = useEditor((s) => s.playhead);
  const selectedStep = useEditor((s) => s.selectedStep);
  const selection = useEditor((s) => s.selection);
  const activeAction = useEditor((s) => s.activeAction);
  const autoKey = useEditor((s) => s.autoKey);
  const loop = useEditor((s) => s.loop);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playing = useEditor((s) => s.playing);
  /** The time under the pointer (a guide line and a time tag). */
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  // The menu of a block (right click, docs/34 E1).
  const [ctx, setCtx] = useState<{ x: number; y: number; b: Block } | null>(null);
  // The pointer is over the ruler: show a frame of that time (docs/22 D1).
  const [scrub, setScrub] = useState<{ clientX: number; top: number } | null>(null);
  const [viewW, setViewW] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** Track filter (docs/19 R4): all, only tracks with actions or keys, or only the selection. */
  const [filter, setFilter] = useState<"all" | "animated" | "selected">("all");
  // The playback bar renders first, so its slots are in the document.
  const [slots, setSlots] = useState<{ left: HTMLElement; right: HTMLElement } | null>(null);
  useEffect(() => {
    const left = document.getElementById(TOOLS_LEFT);
    const right = document.getElementById(TOOLS_RIGHT);
    if (left && right) setSlots({ left, right });
  }, []);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Selected keys (action IDs). Shift + click adds one. The last is the active key. */
  const [selKeys, setSelKeys] = useState<string[]>([]);
  const activeKey = selKeys.at(-1) ?? null;
  const allKeysRef = useRef<GlobalKey[]>([]);
  const clip = useRef<{ group: string; values: Record<string, unknown>; relMs: number; easing?: unknown }[] | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(Math.max(200, el.clientWidth - LABEL_W - 16)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // At least 10 s of room: keys and blocks can go later than the video ends now (docs/32).
  const span = Math.max(10000, timeline.totalMs + TAIL_MS);

  // While it plays, the timeline follows the playhead (it scrolls when the playhead leaves the view).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = (playhead / span) * viewW * zoom;
    if (x < el.scrollLeft || x > el.scrollLeft + viewW - 40) el.scrollLeft = Math.max(0, x - viewW * 0.2);
  }, [playhead, playing]);
  const pxPerMs = (viewW / span) * zoom;
  // A small margin before 0 s, so a key at 0 shows whole (docs/32).
  const trackW = Math.ceil(span * pxPerMs) + TRACK_PAD;
  const px = (ms: number) => TRACK_PAD + ms * pxPerMs;
  /** A length in pixels (no margin). */
  const pw = (ms: number) => ms * pxPerMs;
  const msOf = (dx: number) => Math.round(dx / pxPerMs / 10) * 10;

  // Blocks and keys for each element row.
  const rows = useMemo(() => {
    const blocks = new Map<string, Block[]>();
    const sceneBlocks: Block[] = [];
    for (const ts of timeline.steps) {
      const step = scene.steps[ts.index]!;
      for (const ta of ts.actions) {
        const a = ta.action;
        if (a.type === "morph" && a.targets.length === 1) continue; // these are keys
        const b: Block = { key: `${step.id}/${a.id}/${ta.target}`, stepId: step.id, stepIndex: ts.index, action: a, startMs: ta.startMs, endMs: ta.endMs };
        if (ta.target === "") sceneBlocks.push(b);
        else blocks.set(ta.target, [...(blocks.get(ta.target) ?? []), b]);
      }
      // A wait with no target has no timed action: show it from its delay for its duration.
      for (const a of step.actions) {
        if (a.type !== "wait" || a.targets.length > 0 || ts.actions.some((x) => x.action.id === a.id)) continue;
        sceneBlocks.push({ key: `${step.id}/${a.id}`, stepId: step.id, stepIndex: ts.index, action: a, startMs: ts.startMs + a.delayMs, endMs: ts.startMs + a.delayMs + (a.durationMs ?? 0) });
      }
    }
    const keys = new Map<string, GlobalKey[]>();
    for (const ts of timeline.steps) {
      for (const k of keyframesIn(scene, ts.id)) keys.set(k.element, [...(keys.get(k.element) ?? []), { ...k, atMs: ts.startMs + k.timeMs, fromAtMs: ts.startMs + k.fromMs }]);
    }
    // Element keys (docs/32): on the video time.
    for (const k of elementTimelineKeys(scene)) keys.set(k.element, [...(keys.get(k.element) ?? []), k]);
    const spans = new Map(layerSpans(scene, timeline).map((l) => [l.id, l.spans]));
    const ids = Object.values(scene.elements)
      .filter((e) => e.type !== "group")
      .sort((a, b) => (a.z < b.z ? 1 : a.z > b.z ? -1 : 0))
      .map((e) => e.id);
    return { ids, blocks, keys, spans, sceneBlocks };
  }, [scene, timeline]);

  const seek = (clientX: number) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left - LABEL_W + el.scrollLeft;
    useEditor.getState().pause();
    // The ruler goes past the end, so a key can make the last step longer.
    useEditor.setState({ playhead: Math.max(0, Math.min(span, (x - TRACK_PAD) / pxPerMs)), pinStepEnd: false });
  };

  const startRulerDrag = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    if (e.altKey) {
      // Alt + drag sets the loop region (docs/19 R7).
      const r = scrollRef.current!.getBoundingClientRect();
      const timeAt = (cx: number) => Math.max(0, Math.min(span, Math.round((cx - r.left - LABEL_W - TRACK_PAD + scrollRef.current!.scrollLeft) / pxPerMs)));
      const a = timeAt(e.clientX);
      const move = (ev: PointerEvent) => {
        const b = timeAt(ev.clientX);
        useEditor.setState({ loop: { fromMs: Math.min(a, b), toMs: Math.max(a, b) } });
      };
      const up = (ev: PointerEvent) => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        const b = timeAt(ev.clientX);
        useEditor.setState({ loop: Math.abs(b - a) < 100 ? null : { fromMs: Math.min(a, b), toMs: Math.max(a, b) } });
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      return;
    }
    // The tracks get focus, so the time keys (arrows, Home, End) work next.
    scrollRef.current?.focus({ preventScroll: true });
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  /** Times that a drag snaps to (docs/19 R2): the playhead, step borders, keys, and block edges. */
  const snapTimes = (skip: (t: { key: string }) => boolean) => {
    const out: number[] = [useEditor.getState().playhead];
    for (const ts of timeline.steps) out.push(ts.startMs, ts.holdEndMs);
    for (const k of allKeysRef.current) if (!skip({ key: k.actionId })) out.push(k.atMs);
    for (const list of rows.blocks.values()) for (const b of list) if (!skip({ key: b.key })) out.push(b.startMs, b.endMs);
    return out;
  };

  /**
   * Drag a block (move it or change its duration) or a key. A click with no
   * move selects. baseMs: the time of the dragged edge; it snaps to near
   * times (8 px), unless Shift is down.
   */
  const startDrag = (e: React.PointerEvent, kind: Drag["kind"], key: string, onClick: () => void, onDrop: (dms: number) => void, baseMs?: number, skip: (t: { key: string }) => boolean = (t) => t.key === key) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let moved = false;
    const targets = baseMs === undefined ? [] : snapTimes(skip);
    const toDms = (ev: PointerEvent) => {
      const raw = msOf(ev.clientX - x0);
      if (baseMs === undefined || ev.shiftKey) return raw;
      const want = baseMs + raw;
      let best = raw;
      let dist = 8 / pxPerMs;
      for (const t of targets) {
        if (Math.abs(t - want) < dist) {
          dist = Math.abs(t - want);
          best = Math.round(t - baseMs);
        }
      }
      return best;
    };
    const move = (ev: PointerEvent) => {
      moved ||= Math.abs(ev.clientX - x0) > 2;
      if (moved) setDrag({ kind, key, dms: toDms(ev) });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setDrag(null);
      if (moved) onDrop(toDms(ev));
      else onClick();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const selectEl = (id: string, add = false) => {
    const st = useEditor.getState();
    if (!(id in st.scene.elements)) return;
    st.setSelection(add ? [...new Set([...st.selection, id])] : [id]);
  };

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const durationOf = (b: Block) => b.endMs - b.startMs;

  /**
   * Move an action by dms. If its start goes into another step, the action
   * moves to that step (docs/18 T6), at the same place in time.
   */
  const moveBlock = (b: Block, dms: number) => {
    const st = useEditor.getState();
    const ts = st.timeline.steps.find((x) => x.id === b.stepId);
    if (!ts) return;
    // The action start (its first target), before and after the move.
    const own = ts.actions.filter((x) => x.action.id === b.action.id).map((x) => x.startMs);
    const from = own.length ? Math.min(...own) : ts.startMs + b.action.delayMs;
    const start = Math.max(0, from + dms);
    const i = Math.max(0, stepIndexAt(st.timeline, start));
    const to = st.timeline.steps[i]!;
    if (to.id === b.stepId) {
      // Dropped at the end of another action: chain to it (docs/21 C7), so it moves with that action.
      const step = st.scene.steps.find((x) => x.id === b.stepId)!;
      const leadsBackTo = (id: string | undefined, seen = new Set<string>()): boolean => {
        if (!id || seen.has(id)) return false;
        if (id === b.action.id) return true;
        seen.add(id);
        return leadsBackTo(step.actions.find((x) => x.id === id)?.after, seen);
      };
      const ends = new Map<string, number>();
      for (const x of ts.actions) ends.set(x.action.id, Math.max(ends.get(x.action.id) ?? 0, x.endMs));
      const lead = [...ends].find(([id, end]) => id !== b.action.id && Math.abs(end - start) < 1 && !leadsBackTo(id));
      if (lead) return updateAction(b.stepId, b.action.id, { after: lead[0], delayMs: 0 }, "Chain action");
      const delay = b.action.delayMs + dms;
      // Moved to before the start of its chain: the chain stops.
      if (b.action.after && delay < 0) return updateAction(b.stepId, b.action.id, { after: null, delayMs: Math.max(0, Math.round(start - ts.startMs)) }, "Move action");
      return updateAction(b.stepId, b.action.id, { delayMs: Math.max(0, delay) }, "Move action");
    }
    const { after: _after, ...moved } = b.action;
    void _after;
    const r = st.apply({
      label: "Move action to another step",
      ops: [
        { op: "action.remove", step: b.stepId, id: b.action.id },
        { op: "action.add", step: to.id, action: { ...moved, delayMs: Math.round(start - to.startMs) } },
      ],
    });
    if (r.ok) {
      st.selectStep(to.id);
      useEditor.setState({ activeAction: b.action.id });
    }
  };

  // Chains (docs/22 D2): while a bar moves or changes its length, the bars chained after it move with it.
  const dragged = drag && (drag.kind === "move" || drag.kind === "end") ? drag.key.split("/") : null;
  const followers = useMemo(() => {
    if (!dragged) return new Set<string>();
    const step = scene.steps.find((x) => x.id === dragged[0]);
    const out = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of step?.actions ?? []) {
        if (!a.after || out.has(a.id) || a.id === dragged[1] || (a.after !== dragged[1] && !out.has(a.after))) continue;
        out.add(a.id);
        grew = true;
      }
    }
    return out;
  }, [scene, dragged?.[0], dragged?.[1]]);
  const activeLead = scene.steps.find((x) => x.id === selectedStep)?.actions.find((a) => a.id === activeAction)?.after;

  const renderBlock = (b: Block, elId: string) => {
    const d = drag && drag.key === b.key ? drag : null;
    // The start edge moves the start and keeps the end (docs/34 E2).
    const startShift = d?.kind === "start" ? Math.max(-b.action.delayMs, Math.min(d.dms, durationOf(b) - MIN_MS)) : 0;
    const delay = d?.kind === "move" ? Math.max(0, b.action.delayMs + d.dms) : b.action.delayMs + startShift;
    const dur = d?.kind === "end" ? Math.max(MIN_MS, durationOf(b) + d.dms) : durationOf(b) - startShift;
    const follow = drag && dragged && b.stepId === dragged[0] && followers.has(b.action.id) ? drag.dms : 0;
    const start = b.startMs + (delay - b.action.delayMs) + follow;
    const label = describe(b.action);
    const on = activeAction === b.action.id && selectedStep === b.stepId;
    const lead = activeLead === b.action.id && selectedStep === b.stepId;
    return (
      <Tooltip key={b.key} content={`${label} · step ${b.stepIndex + 1} · ${formatTime(start)} to ${formatTime(start + dur)}${b.action.after ? " · chained: starts when the action before it ends" : ""}`} relationship="description">
        <div
          className={mergeClasses(styles.block, on && styles.blockOn, lead && styles.blockLead)}
          data-lead={lead || undefined}
          style={{ left: px(start), width: Math.max(6, pw(dur)), backgroundColor: COLORS[b.action.type] ?? "#64748b" }}
          role="slider"
          tabIndex={0}
          aria-label={`${label} of ${elId || "the scene"} in step ${b.stepIndex + 1}`}
          aria-valuemin={0}
          aria-valuemax={span}
          aria-valuenow={start}
          data-action={b.action.id}
          onPointerDown={(e) =>
            startDrag(
              e,
              "move",
              b.key,
              () => {
                useEditor.getState().selectStep(b.stepId);
                useEditor.setState({ activeAction: b.action.id, propTab: "actions" });
                if (elId) selectEl(elId);
              },
              (dms) => moveBlock(b, dms),
              b.startMs,
            )
          }
          onContextMenu={(e) => {
            e.preventDefault();
            useEditor.getState().selectStep(b.stepId);
            useEditor.setState({ activeAction: b.action.id });
            setCtx({ x: e.clientX, y: e.clientY, b });
          }}
          onKeyDown={(e) => {
            if (e.key === "Delete" || e.key === "Backspace") {
              // Delete the action of this block (docs/34 E1).
              e.preventDefault();
              e.stopPropagation();
              removeAction(b.stepId, b.action.id);
              return;
            }
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            e.stopPropagation();
            const sign = e.key === "ArrowLeft" ? -1 : 1;
            const stepMs = e.shiftKey ? 500 : 100;
            if (e.altKey) updateAction(b.stepId, b.action.id, { durationMs: Math.max(MIN_MS, durationOf(b) + sign * stepMs) }, "Change duration", `dur/${b.action.id}`);
            else updateAction(b.stepId, b.action.id, { delayMs: Math.max(0, b.action.delayMs + sign * stepMs) }, "Move action", `move/${b.action.id}`);
          }}
        >
          {b.action.after && <span className={styles.chain} aria-hidden data-chain />}
          {pw(dur) > 30 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, verticalAlign: "top" }}>
              <span style={{ display: "inline-flex", transform: "scale(0.8)" }}>{actionIcon(b.action.type)}</span>
              {pw(dur) > 60 ? label : ""}
            </span>
          )}
          {b.action.type !== "wait" && (
            <span
              className={styles.edgeStart}
              data-edge="start"
              onPointerDown={(e) =>
                startDrag(e, "start", b.key, () => undefined, (dms) => {
                  const shift = Math.max(-b.action.delayMs, Math.min(dms, durationOf(b) - MIN_MS));
                  updateAction(b.stepId, b.action.id, { delayMs: b.action.delayMs + shift, durationMs: durationOf(b) - shift }, "Change start");
                }, b.startMs)
              }
            />
          )}
          {b.action.type !== "wait" && (
            <span
              className={styles.edge}
              data-edge="end"
              onPointerDown={(e) => startDrag(e, "end", b.key, () => undefined, (dms) => updateAction(b.stepId, b.action.id, { durationMs: Math.max(MIN_MS, durationOf(b) + dms) }, "Change duration"), b.endMs)}
            />
          )}
        </div>
      </Tooltip>
    );
  };

  /** Scale (Alt + drag, docs/19 R8): the selected keys stretch from the earliest one, so the dragged key moves by dms. */
  const scaleOf = (ids: string[], draggedAt: number, dms: number) => {
    const times = allKeysRef.current.filter((x) => ids.includes(x.actionId)).map((x) => x.atMs);
    const pivot = Math.min(...times);
    const f = draggedAt - pivot > 1 ? Math.max(0.05, (draggedAt + dms - pivot) / (draggedAt - pivot)) : 1;
    return (t: number) => Math.round(pivot + (t - pivot) * f);
  };
  const keyAt = (k: GlobalKey) => {
    if (!drag || !(drag.key === k.actionId || (selKeys.includes(drag.key) && selKeys.includes(k.actionId)))) return k.atMs;
    if (drag.kind === "key") return isElementKey(k) ? Math.max(0, k.atMs + drag.dms) : Math.max(k.fromAtMs + MIN_MS, k.atMs + drag.dms);
    if (drag.kind === "scale") {
      const lead = allKeysRef.current.find((x) => x.actionId === drag.key);
      return lead ? scaleOf(selKeys, lead.atMs, drag.dms)(k.atMs) : k.atMs;
    }
    return k.atMs;
  };

  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Box select (docs/19 R8): drag on an empty part of the tracks to select the keys inside. Shift adds. */
  const startBoxSelect = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || t.closest("[data-key],[data-action],button,[role=button]")) return;
    const host = e.currentTarget;
    const view = scrollRef.current!.getBoundingClientRect();
    // Not on the labels (sticky at the left) or the ruler (sticky at the top).
    if (e.clientX - view.left < LABEL_W || e.clientY - view.top < 40) return;
    const r0 = host.getBoundingClientRect();
    const p0 = { x: e.clientX - r0.left, y: e.clientY - r0.top };
    e.preventDefault();
    host.setPointerCapture(e.pointerId);
    const base = e.shiftKey ? selKeys : [];
    let moved = false;
    // Content coordinates: they stay right when the tracks scroll during the drag.
    const local = (cx: number, cy: number) => {
      const r = host.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    const move = (ev: PointerEvent) => {
      const p = local(ev.clientX, ev.clientY);
      moved ||= Math.hypot(p.x - p0.x, p.y - p0.y) > 3;
      if (moved) setBox({ x0: p0.x, y0: p0.y, x1: p.x, y1: p.y });
    };
    const up = (ev: PointerEvent) => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      setBox(null);
      if (!moved) return;
      const p = local(ev.clientX, ev.clientY);
      const a = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), x2: Math.max(p0.x, p.x), y2: Math.max(p0.y, p.y) };
      const hit = [...host.querySelectorAll<HTMLElement>("[data-key]")]
        .filter((d) => {
          const b = d.getBoundingClientRect();
          const c = local(b.left + b.width / 2, b.top + b.height / 2);
          return c.x >= a.x && c.x <= a.x2 && c.y >= a.y && c.y <= a.y2;
        })
        .map((d) => d.dataset["key"]!);
      setSelKeys([...new Set([...base, ...hit])]);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
  };

  /** Keys in the order to move them: the last first when they move later, so a key does not stop at its neighbor. */
  const byTime = (ids: string[], dms: number) => {
    const at = new Map(allKeysRef.current.map((k) => [k.actionId, k.atMs]));
    return [...ids].sort((a, b) => ((at.get(a) ?? 0) - (at.get(b) ?? 0)) * (dms > 0 ? -1 : 1));
  };

  /** Apply a change to each selected key, as one history entry. */
  const eachKey = (ids: string[], label: string, make: (sc: Scene, k: Keyframe) => OperationInput[], mergeKey = `keys/${label}/${Date.now()}`) => {
    for (const id of ids) {
      const st = useEditor.getState();
      const k = allKeysRef.current.find((x) => x.actionId === id);
      if (!k) continue;
      const ops = make(st.scene, k);
      if (ops.length) st.apply({ label, ops, mergeKey });
    }
  };

  const renderKey = (k: GlobalKey, showTween: boolean) => {
    const at = keyAt(k);
    const name = GROUP_NAMES[k.group] ?? k.group;
    return (
      <span key={`${k.actionId}/${k.group}`}>
        {showTween && <span className={styles.tween} style={{ left: px(k.fromAtMs), width: Math.max(0, px(at) - px(k.fromAtMs)) }} />}
        <Tooltip content={`${name} · ${formatTime(at)} · ${Object.entries(k.values).map(([p, v]) => `${p} ${String(v)}`).join(", ")}`} relationship="description">
          <span
            className={mergeClasses(styles.diamond, selKeys.includes(k.actionId) && styles.diamondOn)}
            style={{ left: px(at) }}
            role="slider"
            tabIndex={0}
            aria-label={`Keyframe ${name} of ${k.element}`}
            aria-valuemin={0}
            aria-valuemax={span}
            aria-valuenow={at}
            data-key={k.actionId}
            onFocus={() => setSelKeys((prev) => (prev.includes(k.actionId) ? prev : [k.actionId]))}
            onPointerDown={(e) => {
              const group = e.shiftKey ? (selKeys.includes(k.actionId) ? selKeys.filter((x) => x !== k.actionId) : [...selKeys, k.actionId]) : selKeys.includes(k.actionId) ? selKeys : [k.actionId];
              setSelKeys(group);
              if (e.shiftKey) {
                e.stopPropagation();
                return;
              }
              const scale = e.altKey && group.length > 1;
              startDrag(
                e,
                scale ? "scale" : "key",
                k.actionId,
                () => {
                  // A click with no drag selects this key only.
                  setSelKeys([k.actionId]);
                  selectEl(k.element);
                  const st = useEditor.getState();
                  if (!isElementKey(k) && st.selectedStep !== k.stepId) st.selectStep(k.stepId);
                  useEditor.setState({ playhead: k.atMs, pinStepEnd: false });
                },
                (dms) => {
                  if (!scale) return eachKey(byTime(group, dms), "Move keyframes", (sc, x) => moveKeyOps(sc, x, x.timeMs + dms));
                  const to = scaleOf(group, k.atMs, dms);
                  const at = new Map(allKeysRef.current.map((x) => [x.actionId, x.atMs]));
                  eachKey(byTime(group, dms), "Stretch keyframes", (sc, x) => moveKeyOps(sc, x, x.timeMs + (to(at.get(x.actionId) ?? 0) - (at.get(x.actionId) ?? 0))));
                },
                k.atMs,
                (t) => group.includes(t.key),
              );
            }}
            onKeyDown={(e) => {
              const st = useEditor.getState();
              const ids = selKeys.includes(k.actionId) ? selKeys : [k.actionId];
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                e.stopPropagation();
                eachKey(ids, "Delete keyframes", (sc, x) => deleteKeyOps(sc, x));
                setSelKeys([]);
                return;
              }
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              e.stopPropagation();
              const d = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 500 : 100);
              if (ids.length === 1) {
                const ops = moveKeyOps(st.scene, k, k.timeMs + d);
                if (ops.length) st.apply({ label: "Move keyframe", ops, mergeKey: `key/${k.element}/${k.group}` });
              } else eachKey(byTime(ids, d), "Move keyframes", (sc, x) => moveKeyOps(sc, x, x.timeMs + d));
            }}
          />
        </Tooltip>
      </span>
    );
  };

  // The keyframe bar: the selected key, its easing, and previous / next key.
  const allKeys = useMemo(() => [...rows.keys.values()].flat(), [rows]);
  allKeysRef.current = allKeys;
  const active = allKeys.find((k) => k.actionId === activeKey);
  const easingVal: Easing = active ? easeOfKey(scene, active) : "ease-in-out";
  const easing = typeof easingVal === "string" ? easingVal : "custom";
  const curveDrag = useRef<string | null>(null);
  const setKeysEasing = (v: Easing, done = true) => {
    // One history entry for a whole handle drag.
    curveDrag.current ??= `curve/${Date.now()}`;
    eachKey(selKeys, "Change easing", (sc, x) => easeKeyOps(x, sc, v), curveDrag.current);
    if (done) curveDrag.current = null;
  };
  const keyTimes = useMemo(() => {
    const own = selection.length > 0 ? allKeys.filter((k) => selection.includes(k.element)) : allKeys;
    return [...new Set(own.map((k) => k.atMs))].sort((a, b) => a - b);
  }, [allKeys, selection]);
  const goKey = (dir: -1 | 1) => {
    const t = dir < 0 ? [...keyTimes].reverse().find((x) => x < playhead - 1) : keyTimes.find((x) => x > playhead + 1);
    if (t === undefined) return;
    useEditor.getState().pause();
    useEditor.setState({ playhead: t, pinStepEnd: false });
  };

  /**
   * Time keys when the timeline has focus (docs/19 R2): ←/→ one frame, Shift
   * ten frames, Home/End, ↑/↓ the previous or next key.
   */
  const onTimeKeys = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    const st = useEditor.getState();
    const frame = 1000 / scene.settings.video.fps;
    let t: number | undefined;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") t = st.playhead + (e.key === "ArrowLeft" ? -1 : 1) * frame * (e.shiftKey ? 10 : 1);
    else if (e.key === "Home") t = 0;
    else if (e.key === "End") t = st.timeline.totalMs;
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      goKey(e.key === "ArrowUp" ? -1 : 1);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (t === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    st.pause();
    useEditor.setState({ playhead: Math.max(0, Math.min(span, Math.round(t * 1000) / 1000)), pinStepEnd: false });
  };

  /** Ctrl or Cmd + C copies the selected keys; Ctrl or Cmd + V pastes them on the selected element, from the playhead. */
  const onKeysClipboard = (e: React.KeyboardEvent) => {
    // F9: easy ease; Shift+F9: slow end (into the key); Ctrl+Shift+F9: slow start. For the selected keys, or the active block.
    if (e.key === "F9") {
      const v: Easing = e.shiftKey && (e.ctrlKey || e.metaKey) ? "ease-in" : e.shiftKey ? "ease-out" : "ease-in-out";
      e.preventDefault();
      e.stopPropagation();
      if (selKeys.length > 0) setKeysEasing(v);
      else {
        const st = useEditor.getState();
        if (st.selectedStep && st.activeAction) updateAction(st.selectedStep, st.activeAction, { easing: v }, "Change easing");
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "c" && selKeys.length > 0) {
      const ks = allKeys.filter((x) => selKeys.includes(x.actionId));
      const t0 = Math.min(...ks.map((x) => x.atMs));
      clip.current = ks.map((x) => ({ group: x.group, values: x.values, relMs: x.atMs - t0 }));
      e.preventDefault();
      e.stopPropagation();
    } else if (k === "v" && clip.current && clip.current.length > 0) {
      const st = useEditor.getState();
      if (st.selection.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      const target = st.selection[0]!;
      const mergeKey = `paste-keys/${Date.now()}`;
      // Pasted keys are element keys on the video time (docs/32).
      for (const c of clip.current) {
        const s2 = useEditor.getState();
        const values = Object.fromEntries(Object.entries(c.values).filter(([k, v]) => KEY_PROPS.has(k) && (typeof v === "number" || typeof v === "string")));
        const ops = setElementKeysOps(s2.scene, target, values, s2.playhead + c.relMs);
        if (ops.length) s2.apply({ label: "Paste keyframes", ops, mergeKey });
      }
    }
  };

  const shown = rows.ids.filter((id) => (filter === "all" ? true : filter === "selected" ? selection.includes(id) : (rows.blocks.get(id)?.length ?? 0) > 0 || (rows.keys.get(id)?.length ?? 0) > 0));

  const tick = tickStep(pxPerMs);
  const ticks: number[] = [];
  for (let t = 0; t <= span; t += tick) ticks.push(t);

  // Ctrl or Cmd + wheel zooms around the pointer.
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const local = e.clientX - r.left - LABEL_W;
    const ms = (local + el.scrollLeft - TRACK_PAD) / pxPerMs;
    const next = Math.min(40, Math.max(1, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    setZoom(next);
    requestAnimationFrame(() => {
      el.scrollLeft = ms * (viewW / span) * next - local;
    });
  };

  return (
    <div className={styles.root} role="region" aria-label="Timeline" style={{ height: `${areaH}px` }} onKeyDown={onKeysClipboard}>
      {ctx && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 39 }} onPointerDown={() => setCtx(null)} onContextMenu={(e) => (e.preventDefault(), setCtx(null))} aria-hidden />
          <div className={styles.ctx} style={{ left: Math.min(ctx.x, window.innerWidth - 190), top: Math.max(8, ctx.y - 10) }} role="menu" aria-label="Block menu">
            <button type="button" role="menuitem" className={styles.ctxItem} onClick={() => (useEditor.setState({ propTab: "actions", activeAction: ctx.b.action.id }), setCtx(null))}>
              Edit…
            </button>
            {(ctx.b.action.type === "enter" || ctx.b.action.type === "exit") && (
              <>
                {(["fade", "rise", "pop", "typewriter", "cascade", "blur"] as const).map((fx) => (
                  <button key={fx} type="button" role="menuitemradio" aria-checked={"effect" in ctx.b.action && ctx.b.action.effect === fx} className={styles.ctxItem} onClick={() => (updateAction(ctx.b.stepId, ctx.b.action.id, { effect: fx }, "Change effect"), setCtx(null))}>
                    {"effect" in ctx.b.action && ctx.b.action.effect === fx ? "✓ " : "\u2003"}
                    {fx === "typewriter" ? "Type" : fx === "cascade" ? "Letters cascade" : fx.charAt(0).toUpperCase() + fx.slice(1)}
                  </button>
                ))}
              </>
            )}
            <button
              type="button"
              role="menuitem"
              className={styles.ctxItem}
              onClick={() => {
                // A copy right after the block.
                const { id: _id, after: _after, ...rest } = ctx.b.action as typeof ctx.b.action & { after?: string };
                void _id;
                void _after;
                useEditor.getState().selectStep(ctx.b.stepId);
                addAction({ ...rest, delayMs: ctx.b.action.delayMs + durationOf(ctx.b) }, "Duplicate action");
                setCtx(null);
              }}
            >
              Duplicate
            </button>
            <button type="button" role="menuitem" className={styles.ctxItem} onClick={() => (removeAction(ctx.b.stepId, ctx.b.action.id), setCtx(null))}>
              Delete
            </button>
          </div>
        </>
      )}
      <Splitter axis="y" label="Resize the timeline" style={{ top: "-3px" }} onStart={() => (startH.current = useEditor.getState().areas.timeline)} onDrag={(d) => setAreas({ timeline: Math.min(700, Math.max(110, startH.current - d)) })} onReset={() => setAreas({ timeline: 240 })} />
      {/* One bar (docs/36): the tools go into the slots of the playback bar. */}
      {slots &&
        createPortal(
          <div className={styles.bar} role="toolbar" aria-label="Timeline tools">
            <Tooltip content="Record (K): while it is on, a change to an element makes a keyframe at the playhead. While it is off, a change sets the element for the whole video." relationship="description">
              <button type="button" aria-pressed={autoKey} aria-label="Record keyframes" className={mergeClasses(styles.btn, styles.rec, autoKey && styles.recOn)} onClick={() => useEditor.setState({ autoKey: !autoKey })}>
                <span className={mergeClasses(styles.recDot, autoKey && styles.recDotOn)} />
                Record
              </button>
            </Tooltip>
            <button type="button" className={styles.btn} aria-label="Previous keyframe" onClick={() => goKey(-1)} disabled={keyTimes.length === 0}>
              ◀◆
            </button>
            <button type="button" className={styles.btn} aria-label="Next keyframe" onClick={() => goKey(1)} disabled={keyTimes.length === 0}>
              ◆▶
            </button>
            {loop ? (
              <Tooltip content="Play goes round in the loop region. Alt + drag on the ruler to change it." relationship="description">
                <button type="button" className={mergeClasses(styles.btn, styles.btnOn)} aria-label="Clear the loop region" onClick={() => useEditor.setState({ loop: null })}>
                  ⟳ {formatTime(loop.fromMs)}–{formatTime(loop.toMs)} ✕
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Alt + drag on the ruler to set a loop region" relationship="description">
                <span style={{ color: "var(--ui-muted)" }}>⟳</span>
              </Tooltip>
            )}
            {active ? (
              <>
                {/* Short: the bar is shared with the play controls (docs/36). The tooltip has all. */}
                <span style={{ color: "var(--ui-muted)", overflow: "hidden", textOverflow: "ellipsis" }} title={selKeys.length > 1 ? undefined : `${active.element} · ${GROUP_NAMES[active.group] ?? active.group} · ${formatTime(active.atMs)}`}>
                  ◆ {selKeys.length > 1 ? `${selKeys.length} keys` : (GROUP_NAMES[active.group] ?? active.group)}
                </span>
                <Popover positioning="above-start" withArrow>
                  <PopoverTrigger disableButtonEnhancement>
                    <button type="button" className={styles.btn} aria-label="Edit the easing curve" style={{ padding: 0, display: "flex" }}>
                      <EaseCurve value={easingVal} />
                    </button>
                  </PopoverTrigger>
                  <PopoverSurface onPointerDown={(e) => e.stopPropagation()} style={{ backgroundColor: "var(--ui-menu)", color: "var(--ui-text)", border: "1px solid var(--ui-outline)" }}>
                    <CurveEditor value={easingVal} onChange={setKeysEasing} />
                  </PopoverSurface>
                </Popover>
                <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  <select className={styles.select} aria-label="Easing of the selected keys" value={easing} onChange={(e) => setKeysEasing(e.target.value as Easing)}>
                    {easing === "custom" && (
                      <option value="custom" disabled>
                        custom curve
                      </option>
                    )}
                    {EasingName.options.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.btn}
                  aria-label="Delete key"
                  title="Delete the selected keys (Delete)"
                  onClick={() => {
                    eachKey(selKeys, "Delete keyframes", (sc, x) => deleteKeyOps(sc, x));
                    setSelKeys([]);
                  }}
                >
                  <Delete16Regular />
                </button>
              </>
            ) : null}
          </div>,
          slots.left,
        )}
      {slots &&
        createPortal(
          <div className={styles.bar} role="group" aria-label="Timeline view">
            <span className={styles.group} role="group" aria-label="Show tracks">
              {(["all", "animated", "selected"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} className={mergeClasses(styles.btn, filter === f && styles.btnOn)} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "animated" ? "Animated" : "Selected"}
                </button>
              ))}
            </span>
            <span className={styles.group} role="group" aria-label="Zoom">
              <button type="button" className={styles.btn} aria-label="Zoom out the timeline" onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
                −
              </button>
              <button type="button" className={styles.btn} aria-label="Fit the timeline" onClick={() => setZoom(1)}>
                Fit
              </button>
              <button type="button" className={styles.btn} aria-label="Zoom in the timeline" onClick={() => setZoom((z) => Math.min(40, z * 1.5))}>
                +
              </button>
            </span>
          </div>,
          slots.right,
        )}
      <div
        className={styles.scroll}
        ref={scrollRef}
        onWheel={onWheel}
        onPointerMove={(e) => {
          const el = scrollRef.current!;
          const x = e.clientX - el.getBoundingClientRect().left - LABEL_W + el.scrollLeft;
          setHoverMs(e.clientX - el.getBoundingClientRect().left < LABEL_W ? null : Math.max(0, Math.min(span, (x - TRACK_PAD) / pxPerMs)));
        }}
        onPointerLeave={() => setHoverMs(null)} tabIndex={0} aria-label="Timeline tracks" onKeyDown={onTimeKeys}>
        <div style={{ width: LABEL_W + trackW, position: "relative" }} onPointerDown={startBoxSelect}>
          <div className={styles.ruler}>
            <div className={styles.corner}>Elements</div>
            <div
              className={styles.rulerTrack}
              style={{ width: trackW }}
              onPointerDown={startRulerDrag}
              onPointerMove={(e) => setScrub(e.buttons === 0 && !playing ? { clientX: e.clientX, top: e.currentTarget.getBoundingClientRect().top } : null)}
              onPointerLeave={() => setScrub(null)}
              aria-label="Time ruler"
            >
              {hoverMs !== null && (
                <span className={styles.hoverTag} style={{ left: px(hoverMs) }} aria-hidden>
                  {formatTime(hoverMs)}
                </span>
              )}
              <span className={styles.playTag} style={{ left: px(playhead) }} aria-hidden>
                {formatTime(playhead)}
              </span>
              {timeline.steps.map((ts) => (
                <div
                  key={ts.id}
                  className={mergeClasses(styles.section, selectedStep === ts.id && styles.sectionOn)}
                  style={{ left: px(ts.startMs), width: Math.max(4, pw(ts.holdEndMs - ts.startMs)) }}
                  title={`Step ${ts.index + 1}: ${scene.steps[ts.index]!.title}`}
                  role="button"
                  aria-label={`Step section ${ts.index + 1}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    useEditor.getState().selectStep(ts.id);
                  }}
                >
                  {ts.index + 1}. {scene.steps[ts.index]!.title}
                </div>
              ))}
              {ticks.map((t) => (
                <span key={t} className={styles.tick} style={{ left: px(t) }}>
                  {formatTime(t).replace(/\.0$/, "")}
                </span>
              ))}
            </div>
          </div>

          {rows.sceneBlocks.length > 0 && (
            <div className={styles.row}>
              <div className={mergeClasses(styles.label, styles.labelBg)}>
                <span className={styles.twirl} />
                Scene (camera, waits)
              </div>
              <div className={styles.track} style={{ width: trackW }}>
                {rows.sceneBlocks.map((b) => renderBlock(b, ""))}
              </div>
            </div>
          )}
          {shown.length === 0 && <div className={styles.empty}>{rows.ids.length === 0 ? "No elements yet. Draw on the canvas." : filter === "selected" ? "Select elements to see their tracks." : "No animated elements."}</div>}
          {shown.map((id) => {
            const el = scene.elements[id]!;
            const keys = rows.keys.get(id) ?? [];
            const groups = [...new Set(keys.map((k) => k.group))];
            const isOpen = open.has(id);
            const sel = selection.includes(id);
            return (
              <div key={id} role="group" aria-label={`Track ${id}`}>
                <div className={mergeClasses(styles.row, sel && styles.rowSel)}>
                  <div className={mergeClasses(styles.label, sel ? styles.labelSel : styles.labelBg)} onClick={(e) => selectEl(id, e.shiftKey)}>
                    <button
                      type="button"
                      className={styles.twirl}
                      aria-label={isOpen ? `Hide the keyed properties of ${id}` : `Show the keyed properties of ${id}`}
                      aria-expanded={isOpen}
                      style={{ visibility: groups.length ? "visible" : "hidden" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(id);
                      }}
                    >
                      {isOpen ? "▼" : "▶"}
                    </button>
                    <span className={styles.icon}>{elementIcon(el.type)}</span>
                    {id}
                  </div>
                  <div className={styles.track} style={{ width: trackW }}>
                    {(rows.spans.get(id) ?? []).map((sp, i) => (
                      <span key={i} className={styles.life} style={{ left: px(sp.startMs), width: Math.max(2, px(sp.endMs) - px(sp.startMs)) }} />
                    ))}
                    {(rows.blocks.get(id) ?? []).map((b) => renderBlock(b, id))}
                    {!isOpen && keys.map((k) => renderKey(k, false))}
                  </div>
                </div>
                {isOpen &&
                  groups.map((g) => (
                    <div key={g} className={styles.row}>
                      <div className={mergeClasses(styles.label, styles.labelBg)} style={{ paddingLeft: "34px", color: "var(--ui-muted)" }}>
                        <span className={styles.icon}>{actionIcon("morph")}</span>
                        {GROUP_NAMES[g] ?? g}
                      </div>
                      <div className={styles.track} style={{ width: trackW }}>
                        {keys.filter((k) => k.group === g).map((k) => renderKey(k, true))}
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
          {timeline.steps.map((ts) => (
            <span key={ts.id} className={styles.boundary} style={{ left: LABEL_W + px(ts.startMs) }} />
          ))}
          {box && <span className={styles.boxSel} style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} aria-hidden />}
          {loop && <span className={styles.loopBand} style={{ left: LABEL_W + px(loop.fromMs), width: pw(loop.toMs - loop.fromMs) }} aria-hidden />}
          {scrub && hoverMs !== null && <ScrubPreview ms={hoverMs} clientX={scrub.clientX} top={scrub.top} />}
          {hoverMs !== null && <span className={styles.hoverLine} style={{ left: LABEL_W + px(hoverMs) }} aria-hidden />}
          <span className={styles.playhead} style={{ left: LABEL_W + px(playhead) }} />
        </div>
      </div>
    </div>
  );
}
