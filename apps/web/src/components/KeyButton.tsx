import { Tooltip, makeStyles, mergeClasses } from "@fluentui/react-components";
import { deleteKeyframeOps, keyframesIn, setKeyframeOps } from "@anivo/ops";
import type { ReactNode } from "react";
import { stepTimeAtPlayhead } from "../commands.js";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  label: { display: "inline-flex", alignItems: "center", gap: "5px", justifyContent: "flex-end", width: "100%" },
  key: {
    width: "14px",
    height: "14px",
    padding: 0,
    border: "none",
    background: "none",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
  },
  diamond: { width: "7px", height: "7px", transform: "rotate(45deg)", border: "1px solid var(--ui-muted)", borderRadius: "1px", boxSizing: "border-box" },
  has: { border: "1px solid #f5b84a" },
  on: { backgroundColor: "#f5b84a", border: "1px solid #f5b84a" },
});

const SAME_MS = 20;

/**
 * A property label with a keyframe button (docs/16): empty when the property
 * has no keyframes in the step, an outline when it has keyframes at other
 * times, and full when a keyframe is at the playhead. Click to add a keyframe
 * with the current value at the playhead, or to remove the one there.
 */
export function KeyLabel({ element, group, values, children }: { element: string; group: string; values: Record<string, unknown>; children: ReactNode }) {
  const s = useStyles();
  const scene = useEditor((st) => st.scene);
  const selectedStep = useEditor((st) => st.selectedStep);
  const playhead = useEditor((st) => st.playhead);
  if (selectedStep === null) return <>{children}</>;
  void playhead;
  const t = stepTimeAtPlayhead();
  const keys = keyframesIn(scene, selectedStep).filter((k) => k.element === element && k.group === group);
  const here = t === null ? undefined : keys.find((k) => Math.abs(k.timeMs - t) <= SAME_MS);
  const label = here ? "Remove the keyframe at the playhead" : t === null ? "Move the playhead into the step to add a keyframe" : "Add a keyframe at the playhead";
  const toggle = () => {
    const st = useEditor.getState();
    if (t === null || st.selectedStep === null) return;
    const ops = here ? deleteKeyframeOps(st.scene, st.selectedStep, here.actionId) : setKeyframeOps(st.scene, st.selectedStep, element, values, t);
    if (ops.length === 0) return;
    st.apply({ label: here ? "Delete keyframe" : "Add keyframe", ops });
    useEditor.setState({ timelineOpen: true, timelineView: "keys" });
  };
  return (
    <span className={s.label}>
      {children}
      <Tooltip content={label} relationship="label">
        <button type="button" className={s.key} disabled={t === null} onClick={toggle} aria-pressed={here !== undefined} data-key-group={group}>
          <span className={mergeClasses(s.diamond, keys.length > 0 && s.has, here && s.on)} />
        </button>
      </Tooltip>
    </span>
  );
}
