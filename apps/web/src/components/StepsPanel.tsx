import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { Add20Regular, ArrowDown20Regular, ArrowUp20Regular, Copy20Regular, Delete20Regular, MoreHorizontal20Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { addStep, deleteStep, duplicateStep, moveStep } from "../commands.js";
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
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 0 0 ${tokens.spacingHorizontalS}` },
  heading: { color: tokens.colorNeutralForeground3 },
  row: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    borderRadius: tokens.borderRadiusMedium,
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
    ":hover .step-more": { opacity: 1 },
  },
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
    ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  dropBefore: { boxShadow: `inset 0 2px 0 ${tokens.colorBrandStroke1}` },
  item: {
    flexGrow: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "2px",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    border: "none",
    background: "transparent",
    color: tokens.colorNeutralForeground1,
    textAlign: "left",
    cursor: "pointer",
  },
  title: { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { color: tokens.colorNeutralForeground3 },
  more: { opacity: 0, marginRight: "2px" },
});

export function StepsPanel() {
  const styles = useStyles();
  const steps = useEditor((s) => s.scene.steps);
  const timeline = useEditor((s) => s.timeline);
  const selected = useEditor((s) => s.selectedStep);
  const selectStep = useEditor((s) => s.selectStep);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  return (
    <nav className={styles.root} aria-label="Steps">
      <div className={styles.header}>
        <Text weight="semibold" size={200} className={styles.heading}>
          Steps
        </Text>
        <Tooltip content="Add step (N)" relationship="label">
          <Button appearance="subtle" size="small" icon={<Add20Regular />} onClick={addStep} aria-label="Add step" />
        </Tooltip>
      </div>
      <div className={mergeClasses(styles.row, selected === null && styles.selected)}>
        <button className={styles.item} onClick={() => selectStep(null)} aria-current={selected === null}>
          <Text size={300}>Base</Text>
          <Text size={100} className={styles.meta}>
            Before step 1
          </Text>
        </button>
      </div>
      {steps.map((step, i) => {
        const t = timeline.steps[i];
        return (
          <div
            key={step.id}
            className={mergeClasses(styles.row, selected === step.id && styles.selected, dropIndex === i && dragId !== step.id && styles.dropBefore)}
            draggable
            onDragStart={(e) => {
              setDragId(step.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setDropIndex(i);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== step.id) {
                const from = steps.findIndex((s) => s.id === dragId);
                moveStep(dragId, from < i ? i - 1 : i);
              }
              setDragId(null);
              setDropIndex(null);
            }}
          >
            <button className={styles.item} onClick={() => selectStep(step.id)} aria-current={selected === step.id} aria-label={`Step ${i + 1}: ${step.title || step.id}`}>
              <Text size={300} className={styles.title}>
                {i + 1}. {step.title || step.id}
              </Text>
              <Text size={100} className={styles.meta}>
                {step.actions.length} {step.actions.length === 1 ? "action" : "actions"} · {t ? formatTime(t.startMs) : ""}
              </Text>
            </button>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button className={mergeClasses(styles.more, "step-more")} appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`More for step ${i + 1}`} />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<Copy20Regular />} onClick={() => duplicateStep(step.id)}>
                    Duplicate
                  </MenuItem>
                  <MenuItem icon={<ArrowUp20Regular />} disabled={i === 0} onClick={() => moveStep(step.id, i - 1)}>
                    Move up
                  </MenuItem>
                  <MenuItem icon={<ArrowDown20Regular />} disabled={i === steps.length - 1} onClick={() => moveStep(step.id, i + 1)}>
                    Move down
                  </MenuItem>
                  <MenuItem icon={<Delete20Regular />} onClick={() => deleteStep(step.id)}>
                    Delete
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        );
      })}
      {steps.length === 0 && (
        <Text size={200} className={styles.meta} style={{ padding: 8 }}>
          Add a step. Each step shows one change in the video.
        </Text>
      )}
    </nav>
  );
}
