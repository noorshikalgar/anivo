/**
 * The status bar (docs/15): mouse and key hints for the current tool on the
 * left, the last message in the center, and the scene numbers on the right.
 */
import { makeStyles } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";

const useStyles = makeStyles({
  root: { display: "flex", alignItems: "center", gap: "16px", height: "22px", padding: "0 10px", backgroundColor: "var(--ui-header)", color: "var(--ui-muted)", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden" },
  hints: { display: "flex", gap: "14px", overflow: "hidden", flexShrink: 1, minWidth: 0 },
  key: { display: "inline-block", padding: "0 4px", marginRight: "4px", borderRadius: "3px", backgroundColor: "var(--ui-widget)", color: "var(--ui-text)", fontSize: "10px", lineHeight: "14px" },
  message: { flexGrow: 1, textAlign: "center", color: "var(--ui-text)", overflow: "hidden", textOverflow: "ellipsis" },
  stats: { flexShrink: 0, fontVariantNumeric: "tabular-nums" },
});

const HINTS: Record<string, [string, string][]> = {
  select: [
    ["Click", "Select"],
    ["Shift", "Add to selection"],
    ["Drag", "Move or box select"],
    ["Space+drag", "Pan"],
    ["Ctrl+wheel", "Zoom"],
    ["F3", "Search"],
  ],
  hand: [
    ["Drag", "Pan"],
    ["Ctrl+wheel", "Zoom"],
    ["V", "Select tool"],
  ],
};
const DRAW: [string, string][] = [
  ["Drag", "Draw"],
  ["Shift", "Keep the proportions"],
  ["Esc", "Select tool"],
];

export function StatusBar() {
  const s = useStyles();
  const tool = useEditor((st) => st.tool);
  const notice = useEditor((st) => st.notice);
  const steps = useEditor((st) => st.scene.steps.length);
  const elements = useEditor((st) => Object.keys(st.scene.elements).length);
  const selected = useEditor((st) => st.selection.length);
  const total = useEditor((st) => st.timeline.totalMs);
  const video = useEditor((st) => st.scene.settings.video);
  const hints = HINTS[tool] ?? DRAW;
  // A message shows for 5 seconds.
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!notice) return;
    setMessage(notice.text);
    const t = window.setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <footer className={s.root} aria-label="Status bar">
      <div className={s.hints}>
        {hints.map(([k, v]) => (
          <span key={k}>
            <span className={s.key}>{k}</span>
            {v}
          </span>
        ))}
      </div>
      <div className={s.message} aria-live="polite">
        {message}
      </div>
      <div className={s.stats}>
        {selected > 0 ? `${selected} of ${elements} elements` : `${elements} elements`} · {steps} steps · {formatTime(total)} · {video.width}×{video.height} · {video.fps} fps
      </div>
    </footer>
  );
}
