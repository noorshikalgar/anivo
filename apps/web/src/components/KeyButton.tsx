import { Tooltip, makeStyles, mergeClasses } from "@fluentui/react-components";
import { ELEMENT_KEY_GROUPS, deleteElementKeysAtOps, setElementKeysOps } from "@anivo/ops";
import type { ReactNode } from "react";
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
 * A property label with a keyframe button (docs/32): empty when the property
 * has no keys, an outline when it has keys at other times, and full when a
 * key is at the playhead. Click to add a key with the value now, at the
 * playhead, or to remove the key there. Keys are on the video time, so the
 * button works in any view, also before the first step.
 */
export function KeyLabel({ element, group, values, children }: { element: string; group: string; values: Record<string, unknown>; children: ReactNode }) {
  const s = useStyles();
  const keysOf = useEditor((st) => st.scene.elements[element]?.keys);
  const playhead = useEditor((st) => st.playhead);
  const props = ELEMENT_KEY_GROUPS[group];
  if (!props) return <>{children}</>;
  // A theme default color has no value to key.
  const set = Object.fromEntries(Object.entries(values).filter(([k, v]) => (props as string[]).includes(k) && (typeof v === "number" || typeof v === "string"))) as Record<string, number | string>;
  const canKey = Object.keys(set).length > 0;
  const times = props.flatMap((p) => (keysOf?.[p] ?? []).map((k) => k.t));
  const t = Math.max(0, Math.round(playhead));
  const here = times.some((x) => Math.abs(x - t) <= SAME_MS);
  const label = here ? "Remove the keyframe at the playhead" : !canKey ? "Choose a value first: the theme default has no keyframe" : `Add a keyframe at ${(t / 1000).toFixed(2)} s`;
  const toggle = () => {
    const st = useEditor.getState();
    const ops = here ? deleteElementKeysAtOps(st.scene, element, props, t) : setElementKeysOps(st.scene, element, set, t);
    if (ops.length === 0) return;
    st.apply({ label: here ? "Delete keyframe" : "Add keyframe", ops });
    useEditor.setState({ timelineOpen: true });
  };
  return (
    <span className={s.label}>
      {children}
      <Tooltip content={label} relationship="label">
        <button type="button" className={s.key} disabled={!here && !canKey} onClick={toggle} aria-pressed={here} data-key-group={group}>
          <span className={mergeClasses(s.diamond, times.length > 0 && s.has, here && s.on)} />
        </button>
      </Tooltip>
    </span>
  );
}
