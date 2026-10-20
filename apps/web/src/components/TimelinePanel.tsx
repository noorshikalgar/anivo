import { Tooltip, makeStyles, mergeClasses } from "@fluentui/react-components";
import { type Action, EasingName } from "@anivo/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteKeyframeOps, keyframesIn, moveKeyframeOps, type Keyframe } from "@anivo/ops";
import { updateAction } from "../commands.js";
import { setAreas, useEditor } from "../store.js";
import { Splitter } from "./ui.js";
import { formatTime } from "./PlaybackBar.js";
import { describe } from "./StepInspector.js";
import { actionIcon } from "./typeIcons.js";

const LABEL_W = 200;
const ROW_H = 22;
const MIN_MS = 50;

const useStyles = makeStyles({
  root: { position: "relative", display: "flex", flexDirection: "column", backgroundColor: "var(--ui-list)", color: "var(--ui-text)", minHeight: 0, fontSize: "12px" },
  ruler: { display: "flex", height: "22px", flexShrink: 0, backgroundColor: "var(--ui-region)", borderBottom: "1px solid var(--ui-line)" },
  rulerLabel: { width: `${LABEL_W}px`, boxSizing: "border-box", flexShrink: 0, padding: "0 8px", display: "flex", alignItems: "center" },
  rulerTrack: { position: "relative", flexGrow: 1, cursor: "pointer" },
  tick: { position: "absolute", top: 0, bottom: 0, borderLeft: "1px solid var(--ui-outline)", paddingLeft: "3px", fontSize: "10px", lineHeight: "22px", color: "var(--ui-muted)", fontVariantNumeric: "tabular-nums" },
  body: { position: "relative", flexGrow: 1, overflowY: "auto", overflowX: "hidden" },
  row: { display: "flex", height: `${ROW_H}px`, alignItems: "center", ":nth-child(even)": { backgroundColor: "var(--ui-list-alt)" } },
  stepRow: { backgroundColor: "var(--ui-panel) !important", fontWeight: 600, cursor: "pointer" },
  selectedStep: { backgroundColor: "var(--ui-row-selected) !important", "--ui-muted": "var(--ui-muted-on-select)" } as never,
  label: { width: `${LABEL_W}px`, boxSizing: "border-box", flexShrink: 0, padding: "0 8px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" },
  labelIcon: { display: "flex", color: "var(--ui-muted)", flexShrink: 0, paddingLeft: "12px" },
  track: { position: "relative", flexGrow: 1, height: "100%" },
  stepBand: { position: "absolute", top: "5px", bottom: "5px", borderRadius: "3px", backgroundColor: "var(--ui-widget)" },
  bar: {
    position: "absolute",
    top: "3px",
    bottom: "3px",
    borderRadius: "3px",
    backgroundColor: "var(--ui-select)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
    ":focus-visible": { outline: "1px solid #fff" },
    cursor: "grab",
    touchAction: "none",
    minWidth: "4px",
  },
  wait: { backgroundColor: "var(--ui-widget)" },
  edge: { position: "absolute", top: 0, bottom: 0, width: "6px", cursor: "ew-resize" },
  playhead: { position: "absolute", top: 0, bottom: 0, width: "2px", marginLeft: "-1px", backgroundColor: "var(--ui-select)", pointerEvents: "none" },
  modes: { display: "flex", gap: "2px", alignItems: "center" },
  mode: {
    border: "none",
    borderRadius: "3px",
    padding: "1px 7px",
    fontSize: "11px",
    cursor: "pointer",
    color: "var(--ui-text)",
    backgroundColor: "var(--ui-widget)",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
  },
  modeOn: { backgroundColor: "var(--ui-select) !important", color: "#fff" },
  rec: { display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "auto" },
  recDot: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--ui-muted)" },
  recOn: { backgroundColor: "#e5484d !important", color: "#fff" },
  recDotOn: { backgroundColor: "#fff" },
  tween: { position: "absolute", top: "10px", height: "2px", backgroundColor: "var(--ui-outline)" },
  diamond: {
    position: "absolute",
    top: "5px",
    width: "11px",
    height: "11px",
    marginLeft: "-6px",
    transform: "rotate(45deg)",
    backgroundColor: "#f5b84a",
    border: "1px solid rgba(0,0,0,0.45)",
    borderRadius: "2px",
    cursor: "grab",
    touchAction: "none",
    ":focus-visible": { outline: "2px solid #fff" },
  },
  diamondSel: { backgroundColor: "#fff" },
  empty: { padding: "10px 12px", color: "var(--ui-muted)" },
  keyBar: { display: "flex", alignItems: "center", gap: "6px", height: "26px", padding: "0 8px", flexShrink: 0, backgroundColor: "var(--ui-region)", borderBottom: "1px solid var(--ui-line)", fontVariantNumeric: "tabular-nums" },
  keyBarSelect: { height: "20px", fontSize: "11px", backgroundColor: "var(--ui-field)", color: "var(--ui-text)", border: "1px solid var(--ui-outline)", borderRadius: "3px" },
});

/** Names of the keyframe groups for the timeline rows. */
const GROUP_NAMES: Record<string, string> = { position: "Position", size: "Size", opacity: "Opacity", rotation: "Rotation", fill: "Fill", stroke: "Stroke", strokeWidth: "Stroke width", textColor: "Text color", fontSize: "Font size", cornerRadius: "Corner radius", label: "Label", shape: "Shape" };

interface Bar {
  stepId: string;
  action: Action;
  startMs: number;
  endMs: number;
  /** Duration of one target (the action duration). */
  durationMs: number;
  stepStartMs: number;
}

type Drag = { key: string; mode: "move" | "start" | "end"; dx: number };

/** Ticks every 1, 2, 5, 10 ... seconds, so that ticks are at least 60 px apart. */
function tickStep(total: number, width: number): number {
  for (const s of [500, 1000, 2000, 5000, 10_000, 30_000, 60_000]) if ((s / total) * width >= 60) return s;
  return 120_000;
}

/** Timeline with one track for each action (FR-STEP-17). Drag a bar to change the delay, drag an edge to change the duration. */
export function TimelinePanel() {
  const areaH = useEditor((s) => s.areas.timeline);
  const startH = useRef(areaH);
  const styles = useStyles();
  const scene = useEditor((s) => s.scene);
  const timeline = useEditor((s) => s.timeline);
  const playhead = useEditor((s) => s.playhead);
  const selectedStep = useEditor((s) => s.selectedStep);
  const total = Math.max(1, timeline.totalMs);
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [view, setView] = useState<"actions" | "keys">("actions");
  const autoKey = useEditor((s) => s.autoKey);
  const [keyDrag, setKeyDrag] = useState<{ id: string; dx: number } | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The Keys view shows the selected step only, so that the keyframes are easy to place.
  const keyStep = view === "keys" ? timeline.steps.find((t) => t.id === selectedStep) : undefined;
  const r0 = keyStep ? keyStep.startMs : 0;
  const span = keyStep ? Math.max(1000, keyStep.holdEndMs - keyStep.startMs) * 1.25 : total;
  const px = (ms: number) => ((ms - r0) / span) * width;
  const msPerPx = span / Math.max(1, width);

  const groups = useMemo(
    () =>
      timeline.steps.map((ts) => {
        const step = scene.steps[ts.index]!;
        const bars: Bar[] = step.actions.map((action) => {
          const timed = ts.actions.filter((t) => t.action.id === action.id);
          const startMs = timed.length ? Math.min(...timed.map((t) => t.startMs)) : ts.startMs + action.delayMs;
          const endMs = timed.length ? Math.max(...timed.map((t) => t.endMs)) : startMs;
          const durationMs = timed.length ? timed[0]!.endMs - timed[0]!.startMs : 0;
          return { stepId: step.id, action, startMs, endMs, durationMs, stepStartMs: ts.startMs };
        });
        return { ts, step, bars };
      }),
    [scene, timeline],
  );

  /** New delay and duration for a drag. */
  const dragged = (b: Bar, d: Drag) => {
    const dms = Math.round((d.dx * msPerPx) / 10) * 10;
    let delay = b.action.delayMs;
    let dur = b.durationMs;
    if (d.mode === "move") delay = Math.max(0, delay + dms);
    else if (d.mode === "end") dur = Math.max(MIN_MS, dur + dms);
    else {
      const nd = Math.max(0, Math.min(delay + dur - MIN_MS, delay + dms));
      dur = dur - (nd - delay);
      delay = nd;
    }
    return { delayMs: delay, durationMs: dur };
  };

  const startDrag = (e: React.PointerEvent, b: Bar, mode: Drag["mode"]) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const key = `${b.stepId}/${b.action.id}`;
    let moved = false;
    const move = (ev: PointerEvent) => {
      moved ||= Math.abs(ev.clientX - x0) > 2;
      setDrag({ key, mode, dx: ev.clientX - x0 });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setDrag(null);
      const st = useEditor.getState();
      if (!moved) {
        st.selectStep(b.stepId);
        st.setSelection(b.action.targets.filter((id) => id in st.scene.elements));
        return;
      }
      const next = dragged(b, { key, mode, dx: ev.clientX - x0 });
      const set: Record<string, number> = {};
      if (next.delayMs !== b.action.delayMs) set["delayMs"] = next.delayMs;
      if (next.durationMs !== b.durationMs) set["durationMs"] = next.durationMs;
      if (Object.keys(set).length) updateAction(b.stepId, b.action.id, set, mode === "move" ? "Move action" : "Change duration");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const tick = tickStep(span, width);
  const ticks: number[] = [];
  for (let t = Math.ceil(r0 / tick) * tick; t <= r0 + span; t += tick) ticks.push(t);

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const st = useEditor.getState();
    st.pause();
    const t = r0 + ((e.clientX - r.left) / r.width) * span;
    // The Keys view can go past the end of the step, so that a keyframe can make the step longer.
    if (keyStep) useEditor.setState({ playhead: Math.max(r0, Math.min(t, r0 + span)), pinStepEnd: false });
    else st.setPlayhead(t);
  };

  const keys = useMemo(() => (selectedStep ? keyframesIn(scene, selectedStep) : []), [scene, selectedStep]);
  /** Rows of the Keys view: one for each element, then one for each property group. */
  const keyRows = useMemo(() => {
    const rows = new Map<string, Map<string, Keyframe[]>>();
    for (const k of keys) {
      const el = rows.get(k.element) ?? new Map<string, Keyframe[]>();
      el.set(k.group, [...(el.get(k.group) ?? []), k]);
      rows.set(k.element, el);
    }
    return [...rows];
  }, [keys]);

  const keyTime = (k: Keyframe) => (keyDrag?.id === k.actionId ? Math.max(k.fromMs + MIN_MS, k.timeMs + Math.round((keyDrag.dx * msPerPx) / 10) * 10) : k.timeMs);

  const startKeyDrag = (e: React.PointerEvent, k: Keyframe) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    el.focus();
    setActiveKey(k.actionId);
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      moved ||= Math.abs(ev.clientX - x0) > 2;
      if (moved) setKeyDrag({ id: k.actionId, dx: ev.clientX - x0 });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setKeyDrag(null);
      const st = useEditor.getState();
      if (!moved) {
        // A click goes to the keyframe and selects the element.
        if (k.element in st.scene.elements) st.setSelection([k.element]);
        st.setPlayhead((keyStep?.startMs ?? 0) + k.timeMs);
        return;
      }
      const t = Math.max(k.fromMs + MIN_MS, k.timeMs + Math.round(((ev.clientX - x0) * msPerPx) / 10) * 10);
      const ops = moveKeyframeOps(st.scene, k.stepId, k.actionId, t);
      if (ops.length) st.apply({ label: "Move keyframe", ops });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const keyKeyDown = (e: React.KeyboardEvent, k: Keyframe) => {
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
  };

  return (
    <div className={styles.root} role="region" aria-label="Timeline" style={{ height: `${areaH}px` }}>
      <Splitter axis="y" label="Resize the timeline" style={{ top: "-3px" }} onStart={() => (startH.current = useEditor.getState().areas.timeline)} onDrag={(d) => setAreas({ timeline: Math.min(600, Math.max(90, startH.current - d)) })} onReset={() => setAreas({ timeline: 200 })} />
      <div className={styles.ruler}>
        <div className={styles.rulerLabel}>
          <div className={styles.modes} role="tablist" aria-label="Timeline view">
            <button type="button" role="tab" aria-selected={view === "actions"} className={mergeClasses(styles.mode, view === "actions" && styles.modeOn)} onClick={() => setView("actions")}>
              Actions
            </button>
            <button type="button" role="tab" aria-selected={view === "keys"} className={mergeClasses(styles.mode, view === "keys" && styles.modeOn)} onClick={() => setView("keys")}>
              Keys
            </button>
          </div>
          <Tooltip content="Auto-key: when you move or change an element in a step, Anivo makes a keyframe at the playhead (K)" relationship="description">
            <button type="button" aria-pressed={autoKey} aria-label="Auto-key" className={mergeClasses(styles.mode, styles.rec, autoKey && styles.recOn)} onClick={() => useEditor.setState({ autoKey: !autoKey })}>
              <span className={mergeClasses(styles.recDot, autoKey && styles.recDotOn)} />
              Key
            </button>
          </Tooltip>
        </div>
        <div className={styles.rulerTrack} ref={trackRef} onPointerDown={seek} aria-label="Time ruler">
          {ticks.map((t) => (
            <span key={t} className={styles.tick} style={{ left: px(t) }}>
              {formatTime(t).replace(/\.0$/, "")}
            </span>
          ))}
          {playhead >= r0 && playhead <= r0 + span && <div className={styles.playhead} style={{ left: px(playhead) }} />}
        </div>
      </div>
      {view === "keys" && keyStep && (() => {
        const k = keys.find((x) => x.actionId === activeKey);
        const action = k ? scene.steps.find((x) => x.id === k.stepId)?.actions.find((a) => a.id === k.actionId) : undefined;
        const easing = action && "easing" in action && typeof action.easing === "string" ? action.easing : "ease-in-out";
        const times = [...new Set(keys.map((x) => x.timeMs))].sort((a, b) => a - b);
        const rel = playhead - keyStep.startMs;
        const go = (dir: -1 | 1) => {
          const t = dir < 0 ? [...times].reverse().find((x) => x < rel - 1) : times.find((x) => x > rel + 1);
          if (t !== undefined) useEditor.setState({ playhead: keyStep.startMs + t, pinStepEnd: false });
        };
        return (
          <div className={styles.keyBar} role="toolbar" aria-label="Keyframe">
            <button type="button" className={styles.mode} aria-label="Previous keyframe" onClick={() => go(-1)}>
              ◀
            </button>
            <button type="button" className={styles.mode} aria-label="Next keyframe" onClick={() => go(1)}>
              ▶
            </button>
            <span>{formatTime(Math.max(0, rel))} in the step</span>
            {k && action ? (
              <>
                <span style={{ color: "var(--ui-muted)" }}>
                  · {k.element} · {GROUP_NAMES[k.group] ?? k.group}
                </span>
                <label style={{ marginLeft: "auto", display: "flex", gap: "4px", alignItems: "center" }}>
                  Easing
                  <select
                    className={styles.keyBarSelect}
                    value={easing}
                    onChange={(e) => updateAction(k.stepId, k.actionId, { easing: e.target.value }, "Change easing")}
                  >
                    {EasingName.options.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.mode}
                  onClick={() => {
                    const st = useEditor.getState();
                    const ops = deleteKeyframeOps(st.scene, k.stepId, k.actionId);
                    if (ops.length) st.apply({ label: "Delete keyframe", ops });
                    setActiveKey(null);
                  }}
                >
                  Delete
                </button>
              </>
            ) : (
              <span style={{ marginLeft: "auto", color: "var(--ui-muted)" }}>Click a keyframe to edit it</span>
            )}
          </div>
        );
      })()}
      <div className={styles.body}>
        {view === "keys" && !keyStep && <div className={styles.empty}>Select a step to see its keyframes.</div>}
        {view === "keys" && keyStep && keyRows.length === 0 && (
          <div className={styles.empty}>No keyframes in this step. Turn on Key, move the playhead, then move or change an element.</div>
        )}
        {view === "keys" &&
          keyStep &&
          keyRows.map(([element, rows]) => (
            <div key={element}>
              <div className={mergeClasses(styles.row, styles.stepRow)} onClick={() => element in scene.elements && useEditor.getState().setSelection([element])}>
                <div className={styles.label}>{element}</div>
                <div className={styles.track} />
              </div>
              {[...rows].map(([group, ks]) => (
                <div key={group} className={styles.row}>
                  <div className={styles.label}>
                    <span className={styles.labelIcon} />
                    {GROUP_NAMES[group] ?? group}
                  </div>
                  <div className={styles.track}>
                    {ks.map((k) => {
                      const t = keyTime(k);
                      return (
                        <span key={k.actionId}>
                          <span className={styles.tween} style={{ left: px(keyStep.startMs + k.fromMs), width: Math.max(0, px(keyStep.startMs + t) - px(keyStep.startMs + k.fromMs)) }} />
                          <Tooltip content={`${formatTime(t)} in the step · ${Object.entries(k.values).map(([p, v]) => `${p} ${String(v)}`).join(", ")}`} relationship="description">
                            <span
                              className={mergeClasses(styles.diamond, activeKey === k.actionId && styles.diamondSel)}
                              style={{ left: px(keyStep.startMs + t) }}
                              role="slider"
                              tabIndex={0}
                              aria-label={`Keyframe ${GROUP_NAMES[group] ?? group} of ${element}`}
                              aria-valuemin={0}
                              aria-valuemax={keyStep.holdEndMs - keyStep.startMs}
                              aria-valuenow={t}
                              data-key={k.actionId}
                              onPointerDown={(e) => startKeyDrag(e, k)}
                              onKeyDown={(e) => keyKeyDown(e, k)}
                              onFocus={() => setActiveKey(k.actionId)}
                            />
                          </Tooltip>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        {view === "actions" && groups.map(({ ts, step, bars }) => (
          <div key={step.id}>
            <div className={mergeClasses(styles.row, styles.stepRow, selectedStep === step.id && styles.selectedStep)} onClick={() => useEditor.getState().selectStep(step.id)}>
              <div className={styles.label}>
                {ts.index + 1}. {step.title || step.id}
              </div>
              <div className={styles.track}>
                <div className={styles.stepBand} style={{ left: px(ts.startMs), width: Math.max(2, px(ts.holdEndMs - ts.startMs)) }} />
              </div>
            </div>
            {bars.map((b) => {
              const key = `${b.stepId}/${b.action.id}`;
              const d = drag?.key === key ? drag : null;
              const view = d ? dragged(b, d) : { delayMs: b.action.delayMs, durationMs: b.durationMs };
              const start = b.stepStartMs + view.delayMs;
              const end = d ? start + view.durationMs + (b.endMs - b.startMs - b.durationMs) : b.endMs;
              return (
                <div key={key} className={styles.row}>
                  <div className={styles.label} title={`${describe(b.action)} · ${b.action.targets.join(", ")}`}>
                    <span className={styles.labelIcon}>{actionIcon(b.action.type)}</span>
                    {describe(b.action)}
                  </div>
                  <div className={styles.track}>
                    <Tooltip content={`${formatTime(start)} to ${formatTime(end)} · delay ${view.delayMs} ms · ${view.durationMs} ms`} relationship="description">
                      <div
                        className={mergeClasses(styles.bar, b.action.type === "wait" && styles.wait)}
                        style={{ left: px(start), width: px(end - start) }}
                        onPointerDown={(e) => startDrag(e, b, "move")}
                        role="slider"
                        aria-label={`${describe(b.action)} in step ${ts.index + 1}`}
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-valuenow={start}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                          e.stopPropagation();
                          const sign = e.key === "ArrowLeft" ? -1 : 1;
                          const step10 = e.shiftKey ? 500 : 100;
                          if (e.altKey) updateAction(b.stepId, b.action.id, { durationMs: Math.max(MIN_MS, b.durationMs + sign * step10) }, "Change duration");
                          else updateAction(b.stepId, b.action.id, { delayMs: Math.max(0, b.action.delayMs + sign * step10) }, "Move action");
                        }}
                      >
                        <span className={styles.edge} style={{ left: -3 }} onPointerDown={(e) => startDrag(e, b, "start")} data-edge="start" />
                        <span className={styles.edge} style={{ right: -3 }} onPointerDown={(e) => startDrag(e, b, "end")} data-edge="end" />
                      </div>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {(playhead >= r0 && playhead <= r0 + span) && <div className={styles.playhead} style={{ left: LABEL_W + px(playhead) }} />}
      </div>
    </div>
  );
}
