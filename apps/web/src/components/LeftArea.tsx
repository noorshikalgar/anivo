/**
 * The left area: the steps, or the library (docs/22 D7), on two tabs.
 */
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { useEditor } from "../store.js";
import { LibraryPanel } from "./LibraryPanel.js";
import { StepsPanel } from "./StepsPanel.js";

const useStyles = makeStyles({
  root: { display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gridTemplateColumns: "minmax(0, 1fr)", minHeight: 0, minWidth: 0, height: "100%", overflow: "hidden" },
  tabs: { display: "flex", gap: "2px", padding: "3px 4px 0", backgroundColor: "var(--ui-list)", borderBottom: "1px solid var(--ui-line)" },
  tab: {
    flex: 1,
    height: "24px",
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    color: "var(--ui-muted)",
    font: "inherit",
    fontSize: "12px",
    cursor: "pointer",
    ":hover": { color: "var(--ui-text)" },
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
  },
  on: { color: "var(--ui-text)", borderBottomColor: "var(--ui-select)", fontWeight: 600 },
  body: { minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)" },
});

export function LeftArea() {
  const s = useStyles();
  const tab = useEditor((st) => st.leftTab);
  const go = (t: "steps" | "library") => useEditor.setState({ leftTab: t });
  return (
    <div className={s.root}>
      <div className={s.tabs} role="tablist" aria-label="Left area">
        <button type="button" role="tab" aria-selected={tab === "steps"} className={mergeClasses(s.tab, tab === "steps" && s.on)} onClick={() => go("steps")}>
          Steps
        </button>
        <button type="button" role="tab" aria-selected={tab === "library"} className={mergeClasses(s.tab, tab === "library" && s.on)} onClick={() => go("library")} title="Widgets, compositions, motion presets, and styles">
          Library
        </button>
      </div>
      <div className={s.body} role="tabpanel">
        {tab === "steps" ? <StepsPanel /> : <LibraryPanel />}
      </div>
    </div>
  );
}
