import { Button, Checkbox, SpinButton, Text, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { Delete20Regular, MicRegular, MusicNote2Regular } from "@fluentui/react-icons";
import { type AudioTrack, trackSpan } from "@anivo/schema";
import { useEffect, useRef, useState } from "react";
import { decode, peaks, setCue } from "../audio.js";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", backgroundColor: "var(--ui-list)", fontSize: "12px", borderTop: "1px solid var(--ui-line)" },
  row: { display: "flex", alignItems: "center", gap: "6px", padding: "2px 8px", height: "34px" },
  label: { width: "160px", "@media (max-width: 599px)": { width: "84px" }, display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" },
  lane: { position: "relative", flexGrow: 1, height: "28px", minWidth: 0, borderRadius: "3px", backgroundColor: "var(--ui-region)" },
  clip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    cursor: "grab",
    touchAction: "none",
    overflow: "hidden",
  },
  canvas: { width: "100%", height: "100%", display: "block" },
  cue: {
    position: "absolute",
    top: "-2px",
    bottom: "-2px",
    width: "14px",
    marginLeft: "-7px",
    cursor: "ew-resize",
    touchAction: "none",
    display: "flex",
    justifyContent: "center",
    "::before": { content: '""', width: "2px", backgroundColor: tokens.colorPaletteMarigoldBorderActive },
  },
  cueLabel: {
    position: "absolute",
    top: 0,
    left: "8px",
    padding: "0 3px",
    fontSize: tokens.fontSizeBase100,
    lineHeight: "14px",
    borderRadius: tokens.borderRadiusSmall,
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorPaletteMarigoldBorderActive,
    pointerEvents: "none",
  },
  playhead: { position: "absolute", top: 0, bottom: 0, width: "2px", marginLeft: "-1px", backgroundColor: "var(--ui-select)", pointerEvents: "none" },
  gain: { width: "88px" },
});

function Waveform({ track, widthPx }: { track: AudioTrack; widthPx: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const styles = useStyles();
  useEffect(() => {
    let live = true;
    void decode(track.assetId)?.then((buffer) => {
      const c = ref.current;
      if (!live || !c) return;
      const w = Math.max(1, Math.round(widthPx));
      c.width = w;
      c.height = 32;
      const g = c.getContext("2d")!;
      // Only the trimmed part plays, so only that part is drawn.
      const all = peaks(buffer, Math.max(1, Math.round((w * track.durationMs) / Math.max(1, trackSpan(track).endMs - track.startMs))));
      const from = Math.floor((track.trimStartMs / track.durationMs) * all.length);
      g.fillStyle = getComputedStyle(c).color;
      for (let x = 0; x < w; x++) {
        const h = Math.max(1, (all[from + x] ?? 0) * 30);
        g.fillRect(x, 16 - h / 2, 1, h);
      }
    });
    return () => {
      live = false;
    };
  }, [track, widthPx]);
  return <canvas ref={ref} className={styles.canvas} style={{ color: tokens.colorBrandForeground1 }} aria-hidden />;
}

/** Cue markers of the steps that start at a voiceover time. Drag a marker to move its cue (FR-AUDIO-02). */
function Cues({ total, laneWidth }: { total: number; laneWidth: number }) {
  const styles = useStyles();
  const steps = useEditor((s) => s.scene.steps);
  const [drag, setDrag] = useState<{ id: string; atMs: number } | null>(null);
  return (
    <>
      {steps.map((step, i) => {
        if (step.trigger.kind !== "cue") return null;
        const atMs = drag?.id === step.id ? drag.atMs : step.trigger.atMs;
        const from = step.trigger.atMs;
        const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
          e.stopPropagation();
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          const x0 = e.clientX;
          const at = (ev: PointerEvent) => Math.max(0, Math.round(from + ((ev.clientX - x0) / Math.max(1, laneWidth)) * total));
          const move = (ev: PointerEvent) => setDrag({ id: step.id, atMs: at(ev) });
          const up = (ev: PointerEvent) => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", up);
            setDrag(null);
            if (at(ev) !== from) setCue(step.id, at(ev), "Move cue");
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
        };
        return (
          <Tooltip key={step.id} content={`Step ${i + 1} (${step.title || step.id}) starts at ${formatTime(atMs)}. Drag to move.`} relationship="description">
            <div
              className={styles.cue}
              style={{ left: (atMs / total) * laneWidth }}
              onPointerDown={onPointerDown}
              role="slider"
              aria-label={`Cue of step ${i + 1}`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={atMs}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.stopPropagation();
                const d = e.shiftKey ? 1000 : 100;
                setCue(step.id, from + (e.key === "ArrowLeft" ? -d : d), "Move cue");
              }}
            >
              <span className={styles.cueLabel}>{i + 1}</span>
            </div>
          </Tooltip>
        );
      })}
    </>
  );
}

function TrackRow({ track }: { track: AudioTrack }) {
  const styles = useStyles();
  const total = useEditor((s) => Math.max(1, s.timeline.totalMs));
  const playhead = useEditor((s) => s.playhead);
  const name = useEditor((s) => s.scene.assets[track.assetId]?.name ?? track.assetId);
  const missing = useEditor((s) => !s.assets.has(track.assetId));
  const lane = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(0);
  const [dragStart, setDragStart] = useState<number | null>(null);

  useEffect(() => {
    const el = lane.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLaneWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const span = trackSpan(track);
  const startMs = dragStart ?? track.startMs;
  const px = (ms: number) => (ms / total) * laneWidth;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const s0 = track.startMs;
    const move = (ev: PointerEvent) => setDragStart(Math.max(0, Math.round(s0 + ((ev.clientX - x0) / Math.max(1, laneWidth)) * total)));
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      const next = Math.max(0, Math.round(s0 + ((ev.clientX - x0) / Math.max(1, laneWidth)) * total));
      setDragStart(null);
      if (next !== s0) useEditor.getState().apply({ label: "Move audio", ops: [{ op: "audio.update", id: track.id, set: { startMs: next } }] });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <div className={styles.row} data-track={track.id}>
      <div className={styles.label}>
        {track.kind === "voiceover" ? <MicRegular /> : <MusicNote2Regular />}
        <Text size={200} title={name}>
          {missing ? `${name} (no file)` : name}
        </Text>
      </div>
      <div className={styles.lane} ref={lane}>
        <Tooltip content={`Starts at ${formatTime(startMs)}. Drag to move.`} relationship="description">
          <div className={styles.clip} style={{ left: px(startMs), width: Math.max(4, px(span.endMs - span.startMs)) }} onPointerDown={onPointerDown} role="slider" aria-label={`${track.kind} start time`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={startMs} tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.stopPropagation();
              const step = e.shiftKey ? 1000 : 100;
              const next = Math.max(0, track.startMs + (e.key === "ArrowLeft" ? -step : step));
              useEditor.getState().apply({ label: "Move audio", ops: [{ op: "audio.update", id: track.id, set: { startMs: next } }] });
            }}
          >
            {!missing && <Waveform track={track} widthPx={px(span.endMs - span.startMs)} />}
          </div>
        </Tooltip>
        {track.kind === "voiceover" && <Cues total={total} laneWidth={laneWidth} />}
        <div className={styles.playhead} style={{ left: px(playhead) }} />
      </div>
      <SpinButton
        className={styles.gain}
        aria-label="Gain in dB"
        value={track.gainDb}
        min={-60}
        max={12}
        step={1}
        displayValue={`${track.gainDb} dB`}
        onChange={(_, d) => {
          const v = d.value ?? Number.parseFloat(d.displayValue ?? "");
          if (Number.isFinite(v)) useEditor.getState().apply({ label: "Change gain", ops: [{ op: "audio.update", id: track.id, set: { gainDb: Math.max(-60, Math.min(12, v)) } }] });
        }}
      />
      {track.kind !== "voiceover" && (
        <Tooltip content="Lower this track while the voiceover speaks (ducking, -12 dB)" relationship="description">
          <Checkbox
            label="Duck"
            checked={track.duckDb !== undefined}
            onChange={(_, d) => useEditor.getState().apply({ label: d.checked ? "Duck under voice" : "No ducking", ops: [{ op: "audio.update", id: track.id, set: { duckDb: d.checked ? -12 : null } }] })}
          />
        </Tooltip>
      )}
      <Tooltip content="Remove audio" relationship="label">
        <Button appearance="subtle" icon={<Delete20Regular />} onClick={() => useEditor.getState().apply({ label: "Remove audio", ops: [{ op: "audio.remove", id: track.id }] })} />
      </Tooltip>
    </div>
  );
}

/** One row for each audio track, above the playback bar (FR-AUDIO-02). */
export function AudioLane() {
  const styles = useStyles();
  const audio = useEditor((s) => s.scene.audio);
  if (audio.length === 0) return null;
  return (
    <div className={styles.root} aria-label="Audio tracks">
      {audio.map((t) => (
        <TrackRow key={t.id} track={t} />
      ))}
    </div>
  );
}
