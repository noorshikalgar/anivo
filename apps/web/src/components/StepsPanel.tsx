import { Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalS,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflowY: "auto",
  },
  heading: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, color: tokens.colorNeutralForeground3 },
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "2px",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    border: "none",
    borderRadius: tokens.borderRadiusMedium,
    background: "transparent",
    color: tokens.colorNeutralForeground1,
    textAlign: "left",
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
    ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  meta: { color: tokens.colorNeutralForeground3 },
});

export function StepsPanel() {
  const styles = useStyles();
  const steps = useEditor((s) => s.scene.steps);
  const timeline = useEditor((s) => s.timeline);
  const selected = useEditor((s) => s.selectedStep);
  const selectStep = useEditor((s) => s.selectStep);

  return (
    <nav className={styles.root} aria-label="Steps">
      <Text weight="semibold" size={200} className={styles.heading}>
        Steps
      </Text>
      <button className={mergeClasses(styles.item, selected === null && styles.selected)} onClick={() => selectStep(null)} aria-current={selected === null}>
        <Text size={300}>Base</Text>
        <Text size={100} className={styles.meta}>
          Before step 1
        </Text>
      </button>
      {steps.map((step, i) => {
        const t = timeline.steps[i];
        return (
          <button key={step.id} className={mergeClasses(styles.item, selected === step.id && styles.selected)} onClick={() => selectStep(step.id)} aria-current={selected === step.id}>
            <Text size={300}>
              {i + 1}. {step.title || step.id}
            </Text>
            <Text size={100} className={styles.meta}>
              {step.actions.length} {step.actions.length === 1 ? "action" : "actions"} · {t ? formatTime(t.startMs) : ""}
            </Text>
          </button>
        );
      })}
    </nav>
  );
}
