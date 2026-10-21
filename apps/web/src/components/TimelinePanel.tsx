/**
 * The timeline (docs/18 T1, T2): one ruler for the whole video. Steps are
 * sections on the ruler. Each element has one row with its life bar (on the
 * screen), its action blocks, and its keys. Unfold a row to see a row for
 * each keyed property. Record (K) makes keys at the playhead.
 */
import { Tooltip, makeStyles, mergeClasses } from "@fluentui/react-components";
import { type Keyframe, deleteKeyframeOps, keyframesIn, moveKeyframeOps } from "@anivo/ops";
import { type Action, EasingName } from "@anivo/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { updateAction } from "../commands.js";
import { layerSpans } from "../layers.js";
import { setAreas, useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";
import { describe } from "./StepInspector.js";
import { actionIcon, elementIcon } from "./typeIcons.js";
import { Splitter } from "./ui.js";

const LABEL_W = 200;
const ROW_H = 24;
const MIN_MS = 50;
/** Time after the end that the ruler shows, so a key can make the last step longer. */
const TAIL_MS = 3000;

const COLORS: Record<string, string> = { enter: "#1d4ed8", exit: "#475569", emphasis: "#b45309", motion: "#0f766e", flow: "#15803d", counter: "#7e22ce", code: "#be185d", camera: "#0369a1", morph: "#6d28d9", wait: "#334155" };

const useStyles = makeStyles({
  root: { position: "relative", display: "flex", flexDirection: "column", backgroundColor: "var(--ui-list)", color: "var(--ui-text)", minHeight: 0, fontSize: "12px" },
  bar: { display: "flex", alignItems: "center", gap: "6px", height: "26px", padding: "0 8px", flexShrink: 0, backgroundColor: "var(--ui-region)", borderBottom: "1px solid var(--ui-line)", fontVariantNumeric: "tabular-nums" },
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
    lineHeight: "17px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    cursor: "grab",
    touchAction: "none",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
    ":focus-visible": { outline: "2px solid #fff" },
  },
  blockOn: { boxShadow: "0 0 0 2px #fff" },
  edge: { position: "absolute", top: 0, bottom: 0, right: "-3px", width: "7px", cursor: "ew-resize" },
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

type Drag = { kind: "move" | "end" | "key"; key: string; dx: number };

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(Math.max(200, el.clientWidth - LABEL_W - 16)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const span = Math.max(1000, timeline.totalMs + TAIL_MS);
  const pxPerMs = (viewW / span) * zoom;
  const trackW = Math.ceil(span * pxPerMs);
  const px = (ms: number) => ms * pxPerMs;
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
    useEditor.setState({ playhead: Math.max(0, Math.min(span, x / pxPerMs)), pinStepEnd: false });
  };

  const startRulerDrag = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  /** Drag a block (move it or change its duration) or a key. A click with no move selects. */
  const startDrag = (e: React.PointerEvent, kind: Drag["kind"], key: string, onClick: () => void, onDrop: (dms: number) => void) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      moved ||= Math.abs(ev.clientX - x0) > 2;
      if (moved) setDrag({ kind, key, dx: ev.clientX - x0 });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setDrag(null);
      if (moved) onDrop(msOf(ev.clientX - x0));
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

  const renderBlock = (b: Block, elId: string) => {
    const d = drag && drag.key === b.key ? drag : null;
    const delay = d?.kind === "move" ? Math.max(0, b.action.delayMs + msOf(d.dx)) : b.action.delayMs;
    const dur = d?.kind === "end" ? Math.max(MIN_MS, durationOf(b) + msOf(d.dx)) : durationOf(b);
    const start = b.startMs + (delay - b.action.delayMs);
    const label = describe(b.action);
    const on = activeAction === b.action.id && selectedStep === b.stepId;
    return (
      <Tooltip key={b.key} content={`${label} · step ${b.stepIndex + 1} · ${formatTime(start)} to ${formatTime(start + dur)}`} relationship="description">
        <div
          className={mergeClasses(styles.block, on && styles.blockOn)}
          style={{ left: px(start), width: Math.max(6, px(dur)), backgroundColor: COLORS[b.action.type] ?? "#64748b" }}
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
              (dms) => updateAction(b.stepId, b.action.id, { delayMs: Math.max(0, b.action.delayMs + dms) }, "Move action"),
            )
          }
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            e.stopPropagation();
            const sign = e.key === "ArrowLeft" ? -1 : 1;
            const stepMs = e.shiftKey ? 500 : 100;
            if (e.altKey) updateAction(b.stepId, b.action.id, { durationMs: Math.max(MIN_MS, durationOf(b) + sign * stepMs) }, "Change duration", `dur/${b.action.id}`);
            else updateAction(b.stepId, b.action.id, { delayMs: Math.max(0, b.action.delayMs + sign * stepMs) }, "Move action", `move/${b.action.id}`);
          }}
        >
          {px(dur) > 44 ? label : ""}
          {b.action.type !== "wait" && (
            <span
              className={styles.edge}
              data-edge="end"
              onPointerDown={(e) => startDrag(e, "end", b.key, () => undefined, (dms) => updateAction(b.stepId, b.action.id, { durationMs: Math.max(MIN_MS, durationOf(b) + dms) }, "Change duration"))}
            />
          )}
        </div>
      </Tooltip>
    );
  };

  const keyAt = (k: GlobalKey) => (drag?.kind === "key" && drag.key === k.actionId ? Math.max(k.fromAtMs + MIN_MS, k.atMs + msOf(drag.dx)) : k.atMs);

  const renderKey = (k: GlobalKey, showTween: boolean) => {
    const at = keyAt(k);
    const name = GROUP_NAMES[k.group] ?? k.group;
    return (
      <span key={`${k.actionId}/${k.group}`}>
        {showTween && <span className={styles.tween} style={{ left: px(k.fromAtMs), width: Math.max(0, px(at) - px(k.fromAtMs)) }} />}
        <Tooltip content={`${name} · ${formatTime(at)} · ${Object.entries(k.values).map(([p, v]) => `${p} ${String(v)}`).join(", ")}`} relationship="description">
          <span
            className={mergeClasses(styles.diamond, activeKey === k.actionId && styles.diamondOn)}
            style={{ left: px(at) }}
            role="slider"
            tabIndex={0}
            aria-label={`Keyframe ${name} of ${k.element}`}
            aria-valuemin={0}
            aria-valuemax={span}
            aria-valuenow={at}
            data-key={k.actionId}
            onFocus={() => setActiveKey(k.actionId)}
            onPointerDown={(e) => {
              setActiveKey(k.actionId);
              startDrag(
                e,
                "key",
                k.actionId,
                () => {
                  selectEl(k.element);
                  const st = useEditor.getState();
                  if (st.selectedStep !== k.stepId) st.selectStep(k.stepId);
                  useEditor.setState({ playhead: k.atMs, pinStepEnd: false });
                },
                (dms) => {
                  const st = useEditor.getState();
                  const ops = moveKeyframeOps(st.scene, k.stepId, k.actionId, k.timeMs + dms);
                  if (ops.length) st.apply({ label: "Move keyframe", ops });
                },
              );
            }}
            onKeyDown={(e) => {
              const st = useEditor.getState();
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                e.stopPropagation();
                const ops = deleteKeyframeOps(st.scene, k.stepId, k.actionId);
                if (ops.length) st.apply({ label: "Delete keyframe", ops });
                return;
              }
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              e.stopPropagation();
              const d = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 500 : 100);
              const ops = moveKeyframeOps(st.scene, k.stepId, k.actionId, k.timeMs + d);
              if (ops.length) st.apply({ label: "Move keyframe", ops, mergeKey: `key/${k.actionId}` });
            }}
          />
        </Tooltip>
      </span>
    );
  };

  // The keyframe bar: the selected key, its easing, and previous / next key.
  const allKeys = useMemo(() => [...rows.keys.values()].flat(), [rows]);
  const active = allKeys.find((k) => k.actionId === activeKey);
  const activeAct = active ? scene.steps.find((s) => s.id === active.stepId)?.actions.find((a) => a.id === active.actionId) : undefined;
  const easing = activeAct && "easing" in activeAct && typeof activeAct.easing === "string" ? activeAct.easing : "ease-in-out";
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
    const ms = (local + el.scrollLeft) / pxPerMs;
    const next = Math.min(40, Math.max(1, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    setZoom(next);
    requestAnimationFrame(() => {
      el.scrollLeft = ms * (viewW / span) * next - local;
    });
  };

  return (
    <div className={styles.root} role="region" aria-label="Timeline" style={{ height: `${areaH}px` }}>
      <Splitter axis="y" label="Resize the timeline" style={{ top: "-3px" }} onStart={() => (startH.current = useEditor.getState().areas.timeline)} onDrag={(d) => setAreas({ timeline: Math.min(700, Math.max(110, startH.current - d)) })} onReset={() => setAreas({ timeline: 240 })} />
      <div className={styles.bar} role="toolbar" aria-label="Timeline tools">
        <Tooltip content="Record (K): while it is on, a change to an element makes a keyframe at the playhead. While it is off, a change sets the element in all steps." relationship="description">
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
        <span>{formatTime(playhead)}</span>
        {active && activeAct ? (
          <>
            <span style={{ color: "var(--ui-muted)" }}>
              · {active.element} · {GROUP_NAMES[active.group] ?? active.group} · {formatTime(active.atMs)}
            </span>
            <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              Easing
              <select className={styles.select} value={easing} onChange={(e) => updateAction(active.stepId, active.actionId, { easing: e.target.value }, "Change easing")}>
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
              onClick={() => {
                const st = useEditor.getState();
                const ops = deleteKeyframeOps(st.scene, active.stepId, active.actionId);
                if (ops.length) st.apply({ label: "Delete keyframe", ops });
                setActiveKey(null);
              }}
            >
              Delete key
            </button>
          </>
        ) : (
          <span style={{ color: "var(--ui-muted)" }}>Click a block or a ◆ to edit it. Ctrl + wheel zooms.</span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: "2px" }}>
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
      </div>
      <div className={styles.scroll} ref={scrollRef} onWheel={onWheel}>
        <div style={{ width: LABEL_W + trackW, position: "relative" }}>
          <div className={styles.ruler}>
            <div className={styles.corner}>Elements</div>
            <div className={styles.rulerTrack} style={{ width: trackW }} onPointerDown={startRulerDrag} aria-label="Time ruler">
              {timeline.steps.map((ts) => (
                <div
                  key={ts.id}
                  className={mergeClasses(styles.section, selectedStep === ts.id && styles.sectionOn)}
                  style={{ left: px(ts.startMs), width: Math.max(4, px(ts.holdEndMs - ts.startMs)) }}
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
          {rows.ids.length === 0 && <div className={styles.empty}>No elements yet. Draw on the canvas.</div>}
          {rows.ids.map((id) => {
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
          <span className={styles.playhead} style={{ left: LABEL_W + px(playhead) }} />
        </div>
      </div>
    </div>
  );
}
