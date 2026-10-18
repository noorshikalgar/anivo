import { Button, Text, makeStyles, tokens } from "@fluentui/react-components";
import { Dismiss20Regular, Next20Regular, RecordStop20Regular } from "@fluentui/react-icons";
import { cancelRecording, nextStep, stopRecording } from "../record.js";
import { withErrors } from "../notify.js";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  dot: { width: "12px", height: "12px", borderRadius: "50%", backgroundColor: tokens.colorPaletteRedBackground3 },
  time: { fontVariantNumeric: "tabular-nums", minWidth: "56px" },
  hint: { flexGrow: 1, color: tokens.colorNeutralForeground3 },
  overlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 1000,
  },
  count: { fontSize: "120px", fontWeight: tokens.fontWeightBold, color: tokens.colorNeutralForegroundOnBrand, textShadow: "0 2px 24px rgba(0,0,0,0.6)" },
});

/** Replaces the playback bar while a voiceover record runs. */
export function RecordBar() {
  const styles = useStyles();
  const rec = useEditor((s) => s.recording)!;
  const steps = useEditor((s) => s.scene.steps);
  const next = steps[rec.stepIndex + 1];
  return (
    <>
      {rec.phase === "countdown" && (
        <div className={styles.overlay} aria-live="assertive">
          <span className={styles.count}>{rec.countdown}</span>
        </div>
      )}
      <div className={styles.root} role="region" aria-label="Voiceover record">
        <span className={styles.dot} />
        <Text className={styles.time} weight="semibold">
          {rec.phase === "countdown" ? "Ready" : formatTime(rec.elapsedMs)}
        </Text>
        <Text size={200} className={styles.hint}>
          {rec.phase === "saving"
            ? "Saving the record…"
            : rec.phase === "countdown"
              ? `The record starts in ${rec.countdown} s.`
              : next
                ? `Speak. Press M or → to start step ${rec.stepIndex + 2}: ${next.title || next.id}.`
                : "This is the last step. Press Stop when you finish."}
        </Text>
        <Button icon={<Next20Regular />} onClick={nextStep} disabled={rec.phase !== "recording" || !next}>
          Next step
        </Button>
        <Button appearance="primary" icon={<RecordStop20Regular />} onClick={() => void withErrors(stopRecording)} disabled={rec.phase === "saving"}>
          Stop
        </Button>
        <Button appearance="subtle" icon={<Dismiss20Regular />} onClick={cancelRecording} disabled={rec.phase === "saving"} aria-label="Cancel record" />
      </div>
    </>
  );
}
