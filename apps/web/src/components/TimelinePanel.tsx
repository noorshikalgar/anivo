import { Text, Tooltip, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Action } from "@anivo/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { updateAction } from "../commands.js";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";
import { describe } from "./StepInspector.js";

const LABEL_W = 200;
const ROW_H = 22;
const MIN_MS = 50;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "200px", borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2, minHeight: 0 },
  ruler: { display: "flex", height: "22px", flexShrink: 0, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  rulerLabel: { width: `${LABEL_W}px`, boxSizing: "border-box", flexShrink: 0, padding: `0 ${tokens.spacingHorizontalS}`, display: "flex", alignItems: "center" },
  rulerTrack: { position: "relative", flexGrow: 1, cursor: "pointer" },
  tick: { position: "absolute", top: 0, bottom: 0, borderLeft: `1px solid ${tokens.colorNeutralStroke2}`, paddingLeft: "3px", fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  body: { position: "relative", flexGrow: 1, overflowY: "auto", overflowX: "hidden" },
  row: { display: "flex", height: `${ROW_H}px`, alignItems: "center" },
  stepRow: { backgroundColor: tokens.colorNeutralBackground3, fontWeight: tokens.fontWeightSemibold, cursor: "pointer" },
  selectedStep: { backgroundColor: tokens.colorNeutralBackground1Selected },
  label: { width: `${LABEL_W}px`, boxSizing: "border-box", flexShrink: 0, padding: `0 ${tokens.spacingHorizontalS}`, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: tokens.fontSizeBase200 },
  track: { position: "relative", flexGrow: 1, height: "100%" },
  stepBand: { position: "absolute", top: "4px", bottom: "4px", borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralStroke2 },
  bar: {
    position: "absolute",
    top: "3px",
    bottom: "3px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorBrandBackground,
    cursor: "grab",
    touchAction: "none",
    minWidth: "4px",
  },
  wait: { backgroundColor: tokens.colorNeutralStrokeAccessible },
  edge: { position: "absolute", top: 0, bottom: 0, width: "6px", cursor: "ew-resize" },
  playhead: { position: "absolute", top: 0, bottom: 0, width: "1px", backgroundColor: tokens.colorPaletteRedForeground1, pointerEvents: "none" },
});

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
  const styles = useStyles();
  const scene = useEditor((s) => s.scene);
  const timeline = useEditor((s) => s.timeline);
  const playhead = useEditor((s) => s.playhead);
  const selectedStep = useEditor((s) => s.selectedStep);
  const total = Math.max(1, timeline.totalMs);
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const px = (ms: number) => (ms / total) * width;
  const msPerPx = total / Math.max(1, width);

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

  const tick = tickStep(total, width);
  const ticks: number[] = [];
  for (let t = 0; t <= total; t += tick) ticks.push(t);

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const st = useEditor.getState();
    st.pause();
    st.setPlayhead(((e.clientX - r.left) / r.width) * total);
  };

  return (
    <div className={styles.root} role="region" aria-label="Timeline">
      <div className={styles.ruler}>
        <div className={styles.rulerLabel}>
          <Text size={200} weight="semibold">
            Timeline
          </Text>
        </div>
        <div className={styles.rulerTrack} ref={trackRef} onPointerDown={seek} aria-label="Time ruler">
          {ticks.map((t) => (
            <span key={t} className={styles.tick} style={{ left: px(t) }}>
              {formatTime(t).replace(/\.0$/, "")}
            </span>
          ))}
          <div className={styles.playhead} style={{ left: px(playhead) }} />
        </div>
      </div>
      <div className={styles.body}>
        {groups.map(({ ts, step, bars }) => (
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
        <div className={styles.playhead} style={{ left: LABEL_W + px(playhead) }} />
      </div>
    </div>
  );
}
