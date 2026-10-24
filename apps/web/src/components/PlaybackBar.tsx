/**
 * The timeline header and the time ruler (docs/15): play controls, the time,
 * and a ruler with one segment for each step. Click or drag the ruler to move
 * the playhead.
 */
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { GanttChart16Regular, Next16Filled, Pause16Filled, Play16Filled, Previous16Filled, ArrowPrevious16Filled, ArrowNext16Filled } from "@fluentui/react-icons";
import { useRef } from "react";
import { useEditor } from "../store.js";
import { IconButton } from "./ui.js";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", backgroundColor: "var(--ui-region)", color: "var(--ui-text)", fontSize: "12px" },
  header: { display: "flex", alignItems: "center", gap: "2px", height: "26px", padding: "0 6px", backgroundColor: "var(--ui-header)" },
  title: { fontWeight: 600, marginRight: "8px" },
  transport: { display: "flex", alignItems: "center", gap: "1px", margin: "0 auto" },
  play: { backgroundColor: "var(--ui-widget)", color: "var(--ui-text) !important" },
  time: { minWidth: "112px", height: "20px", padding: "0 8px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", backgroundColor: "var(--ui-field)", fontVariantNumeric: "tabular-nums", fontSize: "11px", marginLeft: "6px" },
  ruler: { position: "relative", height: "26px", margin: "0 8px", cursor: "ew-resize", touchAction: "none", userSelect: "none", outline: "none", ":focus-visible": { boxShadow: "inset 0 0 0 1px var(--ui-select)" } },
  seg: { position: "absolute", top: "3px", bottom: "3px", borderRadius: "3px", backgroundColor: "var(--ui-panel)", overflow: "hidden", display: "flex", alignItems: "center", padding: "0 5px", fontSize: "10px", color: "var(--ui-muted)", whiteSpace: "nowrap", boxSizing: "border-box", borderLeft: "1px solid var(--ui-line)" },
  segOn: { backgroundColor: "var(--ui-row-selected)", color: "var(--ui-text)" },
  head: { position: "absolute", top: 0, bottom: 0, width: "2px", marginLeft: "-1px", backgroundColor: "var(--ui-select)", pointerEvents: "none" },
  headKnob: { position: "absolute", top: "-1px", left: "50%", transform: "translateX(-50%)", width: "8px", height: "8px", borderRadius: "2px", backgroundColor: "var(--ui-select)" },
});

export function formatTime(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

export function PlaybackBar() {
  const s = useStyles();
  const playhead = useEditor((st) => st.playhead);
  const rate = useEditor((st) => st.rate);
  const total = useEditor((st) => st.timeline.totalMs);
  const steps = useEditor((st) => st.timeline.steps);
  const titles = useEditor((st) => st.scene.steps);
  const selected = useEditor((st) => st.selectedStep);
  const playing = useEditor((st) => st.playing);
  const timelineOpen = useEditor((st) => st.timelineOpen);
  const { play, pause, setPlayhead, selectStep } = useEditor.getState();
  const ruler = useRef<HTMLDivElement>(null);
  const span = Math.max(1, total);
  const pct = (ms: number) => `${(Math.min(span, Math.max(0, ms)) / span) * 100}%`;
  const current = steps.findIndex((t) => playhead >= t.startMs && playhead < t.holdEndMs);
  const seek = (clientX: number) => {
    const r = ruler.current!.getBoundingClientRect();
    pause();
    setPlayhead(((clientX - r.left) / r.width) * span);
  };
  const go = (dir: -1 | 1) => {
    // Previous or next step start.
    const starts = steps.map((t) => t.startMs);
    const t = dir < 0 ? [...starts].reverse().find((x) => x < playhead - 50) : starts.find((x) => x > playhead + 50);
    const i = t === undefined ? -1 : starts.indexOf(t);
    if (i >= 0) selectStep(titles[i]!.id);
    else if (dir < 0) {
      pause();
      selectStep(null);
    }
  };

  return (
    <div className={s.root}>
      <div className={s.header}>
        <span className={s.title}>Timeline</span>
        <div className={s.transport} role="group" aria-label="Playback">
          <IconButton label="Go to start" icon={<ArrowPrevious16Filled />} onClick={() => (pause(), setPlayhead(0))} />
          <IconButton label="Previous step" icon={<Previous16Filled />} onClick={() => go(-1)} />
          <IconButton className={s.play} label={playing ? "Pause (Space)" : "Play (Space)"} icon={playing ? <Pause16Filled /> : <Play16Filled />} onClick={() => (playing ? pause() : play())} disabled={total === 0} />
          <IconButton label="Next step" icon={<Next16Filled />} onClick={() => go(1)} />
          <IconButton label="Go to end" icon={<ArrowNext16Filled />} onClick={() => (pause(), setPlayhead(total))} />
          <span className={s.time} aria-live="off">
            {formatTime(playhead)} / {formatTime(total)}
            {rate !== 1 && <b title="Shuttle speed (J / L)"> {rate < 0 ? "◀" : "▶"} {Math.abs(rate)}×</b>}
          </span>
        </div>
        <IconButton label={timelineOpen ? "Hide the timeline" : "Show the timeline"} pressed={timelineOpen} tool icon={<GanttChart16Regular />} onClick={() => useEditor.setState({ timelineOpen: !timelineOpen })} />
      </div>
      <div
        ref={ruler}
        className={s.ruler}
        style={timelineOpen ? { display: "none" } : undefined}
        role="slider"
        tabIndex={0}
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(playhead)}
        aria-valuetext={formatTime(playhead)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e.clientX);
          const move = (ev: PointerEvent) => seek(ev.clientX);
          const el = e.currentTarget;
          const up = () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", up);
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
        }}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" ? 100 : e.key === "ArrowLeft" ? -100 : 0;
          if (d) {
            e.preventDefault();
            e.stopPropagation();
            pause();
            setPlayhead(playhead + (e.shiftKey ? d * 10 : d));
          }
        }}
      >
        {steps.map((t, i) => (
          <div key={t.id} className={mergeClasses(s.seg, (selected === t.id || (selected === null && i === current)) && s.segOn)} style={{ left: pct(t.startMs), width: `calc(${pct(t.holdEndMs - t.startMs)} - 1px)` }} title={titles[i]?.title}>
            {i + 1} {titles[i]?.title}
          </div>
        ))}
        <div className={s.head} style={{ left: pct(playhead) }}>
          <span className={s.headKnob} />
        </div>
      </div>
    </div>
  );
}
