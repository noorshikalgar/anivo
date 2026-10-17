import { Button, Slider, Text, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { Pause20Regular, Play20Regular, Previous20Regular } from "@fluentui/react-icons";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  slider: { flexGrow: 1, minWidth: 0 },
  time: { fontVariantNumeric: "tabular-nums", minWidth: "96px", textAlign: "right" },
});

export function formatTime(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

export function PlaybackBar() {
  const styles = useStyles();
  const playhead = useEditor((s) => s.playhead);
  const total = useEditor((s) => s.timeline.totalMs);
  const playing = useEditor((s) => s.playing);
  const { play, pause, setPlayhead } = useEditor.getState();

  return (
    <div className={styles.root}>
      <Tooltip content="Go to start" relationship="label">
        <Button appearance="subtle" icon={<Previous20Regular />} onClick={() => (pause(), setPlayhead(0))} />
      </Tooltip>
      <Tooltip content={playing ? "Pause (Space)" : "Play (Space)"} relationship="label">
        <Button appearance="subtle" icon={playing ? <Pause20Regular /> : <Play20Regular />} onClick={() => (playing ? pause() : play())} disabled={total === 0} />
      </Tooltip>
      <Slider
        className={styles.slider}
        min={0}
        max={Math.max(1, Math.round(total))}
        value={Math.round(playhead)}
        onChange={(_, d) => (pause(), setPlayhead(d.value))}
        aria-label="Playhead"
      />
      <Text className={styles.time} size={200}>
        {formatTime(playhead)} / {formatTime(total)}
      </Text>
    </div>
  );
}
