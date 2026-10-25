/**
 * The animations of one element (docs/34 E3): every action on it, in time
 * order, with its time; click a row to edit it, × to delete it. Buttons add a
 * common effect at the playhead. So text effects (typing, fade in, …) are
 * visible and easy to control from the element itself.
 */
import type { Element } from "@anivo/schema";
import { makeStyles } from "@fluentui/react-components";
import { Dismiss12Regular } from "@fluentui/react-icons";
import { addAction, removeAction } from "../commands.js";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";
import { describe } from "./StepInspector.js";
import { actionIcon } from "./typeIcons.js";
import { Btn, Panel } from "./ui.js";

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column", gap: "2px", marginBottom: "8px" },
  row: { display: "flex", alignItems: "center", gap: "6px", padding: "4px 6px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", ":hover": { backgroundColor: "var(--ui-hover)" } },
  on: { backgroundColor: "var(--ui-row-selected)" },
  name: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  time: { color: "var(--ui-muted)", fontVariantNumeric: "tabular-nums", fontSize: "11px" },
  x: { border: "none", background: "transparent", color: "var(--ui-muted)", cursor: "pointer", padding: "2px", lineHeight: 0, ":hover": { color: "var(--ui-text)" } },
  add: { display: "flex", flexWrap: "wrap", gap: "4px" },
  empty: { color: "var(--ui-muted)", fontSize: "12px", marginBottom: "8px" },
});

const ADD: { label: string; action: Record<string, unknown>; text?: boolean }[] = [
  { label: "Fade in", action: { type: "enter", effect: "fade" } },
  { label: "Rise", action: { type: "enter", effect: "rise" } },
  { label: "Pop", action: { type: "enter", effect: "pop" } },
  { label: "Type", action: { type: "enter", effect: "typewriter" }, text: true },
  { label: "Words rise", action: { type: "enter", effect: "cascade", params: { unit: "word" }, durationMs: 1200, easing: "linear" }, text: true },
  { label: "Pulse", action: { type: "emphasis", effect: "pulse" } },
  { label: "Fade out", action: { type: "exit", effect: "fade" } },
];

export function ElementAnimations({ el }: { el: Element }) {
  const s = useStyles();
  const timeline = useEditor((st) => st.timeline);
  const activeAction = useEditor((st) => st.activeAction);
  const rows = timeline.steps.flatMap((ts) => {
    const seen = new Set<string>();
    return ts.actions
      .filter((ta) => {
        if (ta.target !== el.id || seen.has(ta.action.id)) return false;
        seen.add(ta.action.id);
        return true;
      })
      .map((ta) => {
        const all = ts.actions.filter((x) => x.action.id === ta.action.id);
        return { stepId: ts.id, action: ta.action, from: Math.min(...all.map((x) => x.startMs)), to: Math.max(...all.map((x) => x.endMs)) };
      });
  });
  rows.sort((a, b) => a.from - b.from);
  const isText = el.type === "text" || (el.type !== "connector" && "label" in el && !!el.label);
  return (
    <Panel id="el-animation" title="Animation">
      {rows.length === 0 ? (
        <div className={s.empty}>No animation yet. Add one at the playhead:</div>
      ) : (
        <div className={s.list} role="list" aria-label={`Animations of ${el.id}`}>
          {rows.map((r) => (
            <div
              key={`${r.stepId}/${r.action.id}`}
              role="listitem"
              aria-label={`${describe(r.action)} ${formatTime(r.from)}`}
              className={`${s.row} ${activeAction === r.action.id ? s.on : ""}`}
              onClick={() => {
                const st = useEditor.getState();
                st.selectStep(r.stepId);
                useEditor.setState({ activeAction: r.action.id, playhead: r.from, pinStepEnd: false, timelineOpen: true });
              }}
            >
              {actionIcon(r.action.type)}
              <span className={s.name}>{describe(r.action)}</span>
              <span className={s.time}>
                {formatTime(r.from)}–{formatTime(r.to)}
              </span>
              <button
                type="button"
                className={s.x}
                aria-label={`Delete ${describe(r.action)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeAction(r.stepId, r.action.id);
                }}
              >
                <Dismiss12Regular />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={s.add} role="group" aria-label="Add an animation">
        {ADD.filter((a) => !a.text || isText).map((a) => (
          <Btn key={a.label} title={`Add ${a.label.toLowerCase()} at the playhead`} onClick={() => addAction({ ...a.action, targets: [el.id] }, `Add ${a.label.toLowerCase()}`)}>
            {a.label}
          </Btn>
        ))}
      </div>
    </Panel>
  );
}
