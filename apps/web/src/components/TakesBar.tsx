import { voiceParts } from "@anivo/ops";
import { Button, Text, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowLeft20Regular, ArrowRight20Regular, Checkmark20Regular, Dismiss20Regular, Play20Regular, Record20Regular, RecordStop20Regular } from "@fluentui/react-icons";
import { useEffect } from "react";
import { withErrors } from "../notify.js";
import { useEditor } from "../store.js";
import { cancelTake, closeTakes, goToTake, previewTake, recordTake, saveTake } from "../takes.js";
import { formatTime } from "./PlaybackBar.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  row: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  title: { flexGrow: 1, minWidth: "160px" },
  muted: { color: tokens.colorNeutralForeground3 },
  dot: { width: "12px", height: "12px", borderRadius: "50%", backgroundColor: tokens.colorPaletteRedBackground3, flexShrink: 0 },
  time: { fontVariantNumeric: "tabular-nums", minWidth: "56px" },
  prompt: { fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400, padding: `${tokens.spacingVerticalXS} 0` },
  overlay: { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 1000 },
  count: { fontSize: "120px", fontWeight: tokens.fontWeightBold, color: tokens.colorNeutralForegroundOnBrand, textShadow: "0 2px 24px rgba(0,0,0,0.6)" },
});

/** Replaces the playback bar while the voiceover is recorded step by step. */
export function TakesBar() {
  const styles = useStyles();
  const t = useEditor((s) => s.takes)!;
  const scene = useEditor((s) => s.scene);
  const steps = scene.steps;
  const step = steps[t.stepIndex];
  const part = voiceParts(scene).find((p) => p.stepId === step?.id);
  const line = scene.script.find((l) => l.stepId === step?.id)?.text;
  const busy = t.phase === "countdown" || t.phase === "recording" || t.phase === "saving";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const st = useEditor.getState().takes;
      if (!st) return;
      if (e.key === "r" || e.key === "R") void withErrors(recordTake);
      else if (e.key === " " && st.phase === "recording") void withErrors(saveTake);
      else if (e.key === " " && st.phase === "ready") previewTake();
      else if (e.key === "Escape") (st.phase === "ready" ? closeTakes : cancelTake)();
      else if (e.key === "ArrowRight" && st.phase === "ready") goToTake(st.stepIndex + 1);
      else if (e.key === "ArrowLeft" && st.phase === "ready") goToTake(st.stepIndex - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (!step) return null;
  return (
    <>
      {t.phase === "countdown" && (
        <div className={styles.overlay} aria-live="assertive">
          <span className={styles.count}>{t.countdown}</span>
        </div>
      )}
      <div className={styles.root} role="region" aria-label="Record step by step">
        <div className={styles.row}>
          {t.phase === "recording" && <span className={styles.dot} />}
          <Text className={styles.title} weight="semibold">
            Step {t.stepIndex + 1} of {steps.length}: {step.title || step.id}
          </Text>
          <Text size={200} className={styles.muted}>
            {t.phase === "recording"
              ? formatTime(t.elapsedMs)
              : t.phase === "saving"
                ? "Saving the take…"
                : t.phase === "countdown"
                  ? `The take starts in ${t.countdown} s.`
                  : part
                    ? `Voice: ${((part.toMs - part.fromMs) / 1000).toFixed(1)} s`
                    : "No voice yet"}
          </Text>
          <Tooltip content="Previous step (←)" relationship="label">
            <Button icon={<ArrowLeft20Regular />} disabled={busy || t.stepIndex === 0} onClick={() => goToTake(t.stepIndex - 1)} />
          </Tooltip>
          {t.phase === "recording" ? (
            <Button appearance="primary" icon={<RecordStop20Regular />} onClick={() => void withErrors(saveTake)}>
              Stop (Space)
            </Button>
          ) : (
            <Button appearance="primary" icon={<Record20Regular />} disabled={busy} onClick={() => void withErrors(recordTake)}>
              {part ? "Record again (R)" : "Record (R)"}
            </Button>
          )}
          <Tooltip content="Play this step with its voice (Space)" relationship="label">
            <Button icon={<Play20Regular />} disabled={busy || !part} onClick={previewTake} />
          </Tooltip>
          <Tooltip content="Next step (→)" relationship="label">
            <Button icon={<ArrowRight20Regular />} disabled={busy || t.stepIndex >= steps.length - 1} onClick={() => goToTake(t.stepIndex + 1)} />
          </Tooltip>
          {busy ? (
            <Button appearance="subtle" icon={<Dismiss20Regular />} disabled={t.phase === "saving"} onClick={cancelTake}>
              Cancel
            </Button>
          ) : (
            <Button appearance="subtle" icon={<Checkmark20Regular />} onClick={closeTakes}>
              Done
            </Button>
          )}
        </div>
        <Text className={line ? styles.prompt : styles.muted} size={line ? undefined : 200}>
          {line ?? "Speak about this step. The step plays while you record. Stop when you finish; the next step opens."}
        </Text>
      </div>
    </>
  );
}
