import { Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, Text, makeStyles, tokens } from "@fluentui/react-components";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  surface: { maxWidth: "640px", width: "100%" },
  grid: { display: "grid", gridTemplateColumns: "1fr auto", gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`, maxHeight: "65vh", overflowY: "auto" },
  key: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground2, textAlign: "right" },
  list: { display: "flex", flexDirection: "column", gap: "2px", maxHeight: "60vh", overflowY: "auto" },
  row: { display: "grid", gridTemplateColumns: "1fr 120px", gap: tokens.spacingHorizontalS, padding: "4px 6px", borderRadius: tokens.borderRadiusSmall },
  current: { backgroundColor: tokens.colorNeutralBackground1Selected },
  muted: { color: tokens.colorNeutralForeground3 },
});

const SHORTCUTS: [string, string][] = [
  ["Command palette", "Ctrl+K"],
  ["Shortcut help", "?"],
  ["Undo / Redo", "Ctrl+Z / Ctrl+Shift+Z"],
  ["Save / Save as / Open", "Ctrl+S / Ctrl+Shift+S / Ctrl+O"],
  ["Export", "Ctrl+E"],
  ["Present / notes window", "F5 / W"],
  ["Play or pause", "Space"],
  ["Add step", "N"],
  ["Tools: select, hand, rectangle, ellipse, diamond", "V H R O D"],
  ["Tools: arrow, text, icon, code", "A T I C"],
  ["Draw a motion path for the selection", "P"],
  ["Select all / Delete", "Ctrl+A / Delete"],
  ["Copy / Paste / Duplicate", "Ctrl+C / Ctrl+V / Ctrl+D"],
  ["Copy style / Paste style", "Ctrl+Alt+C / Ctrl+Alt+V"],
  ["Previous / next step", "Page Up / Page Down"],
  ["Play backward / forward (again: faster)", "J / L"],
  ["One frame back / forward (Shift: 10)", ", / ."],
  ["Group / Ungroup", "Ctrl+G / Ctrl+Shift+G"],
  ["Lock / Hide in editor", "Ctrl+Shift+L / Ctrl+Shift+H"],
  ["Move selection (10 px with Shift)", "Arrow keys"],
  ["Edit the text of the selection", "Enter"],
  ["Cue at the playhead (while playing)", "M"],
  ["Record keyframes on or off", "K"],
  ["Key at the playhead: position / all properties (with a selection)", "I / Shift+I"],
  ["Delete the keys at the playhead", "Alt+I"],
  ["Timeline: zoom", "Ctrl+wheel"],
  ["Timeline: one frame / ten frames / start / end / previous or next key", "← → / Shift+← → / Home / End / ↑ ↓"],
  ["Timeline: drag without snapping", "Shift+drag"],
  ["Timeline: set a loop region (play goes round in it)", "Alt+drag on the ruler"],
  ["Easing of the selected keys: easy ease / slow end / slow start", "F9 / Shift+F9 / Ctrl+Shift+F9"],
  ["Timeline: select many keys / copy / paste keys", "Shift+click / Ctrl+C / Ctrl+V"],
  ["Pan / Zoom", "Space+drag / Ctrl+wheel"],
  ["Fit video to screen", "Shift+1"],
];

/** Shortcut help (FR-UX-01). Opens with "?". */
export function ShortcutHelp() {
  const styles = useStyles();
  const open = useEditor((s) => s.helpOpen);
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && useEditor.setState({ helpOpen: false })}>
      <DialogSurface className={styles.surface} aria-label="Keyboard shortcuts">
        <DialogBody>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogContent>
            <div className={styles.grid}>
              {SHORTCUTS.map(([what, keys]) => (
                <div key={what} style={{ display: "contents" }}>
                  <Text>{what}</Text>
                  <Text className={styles.key}>{keys}</Text>
                </div>
              ))}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** History with the author of each change: "You" or the agent name (FR-AGENT-11). */
export function HistoryDialog() {
  const styles = useStyles();
  const open = useEditor((s) => s.historyOpen);
  useEditor((s) => s.version);
  const history = useEditor.getState().bus.history;
  const who = (a: { kind: string; name?: string | undefined }) => (a.kind === "user" ? "You" : a.kind === "agent" ? (a.name ?? "Agent") : a.kind === "system" ? "Anivo" : a.kind);
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && useEditor.setState({ historyOpen: false })}>
      <DialogSurface className={styles.surface} aria-label="History">
        <DialogBody>
          <DialogTitle>History</DialogTitle>
          <DialogContent>
            {history.length === 0 ? (
              <Text className={styles.muted}>No changes yet.</Text>
            ) : (
              <div className={styles.list} role="list" aria-label="Changes">
                {[...history].reverse().map((h, i) => (
                  <div key={h.seq} className={`${styles.row} ${i === 0 ? styles.current : ""}`} role="listitem">
                    <Text>{h.label}</Text>
                    <Text className={styles.muted}>{who(h.author)}</Text>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
