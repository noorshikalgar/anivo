import { Dialog, DialogBody, DialogSurface, Input, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { Search20Regular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import {
  addStep,
  alignSelection,
  autoLayoutSelection,
  commitSettings,
  copySelection,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  groupSelection,
  insertTable,
  pasteFromClipboard,
  selectAll,
  toggleHideSelection,
  toggleLockSelection,
  ungroupSelection,
  unlockAndShowAll,
} from "../commands.js";
import { cueAllSteps, importAudio } from "../audio.js";
import { pickImage } from "../images.js";
import { startRecording } from "../record.js";
import { openTakes } from "../takes.js";
import { goHome, newFromTemplate, newScene, openFile, runImport, saveFile, saveFileAs } from "../files.js";
import { notify, withErrors } from "../notify.js";
import { shareServer } from "../share.js";
import { type Tool, useEditor } from "../store.js";
import { TOOLS } from "./ToolPalette.js";
import { WIDGETS, insertWidget } from "../widgets.js";
import { TEMPLATES } from "./TopBar.js";

const useStyles = makeStyles({
  surface: { maxWidth: "560px", width: "100%", padding: tokens.spacingVerticalS, alignSelf: "flex-start", marginTop: "12vh" },
  list: { maxHeight: "360px", overflowY: "auto", marginTop: tokens.spacingVerticalS, display: "flex", flexDirection: "column" },
  item: {
    display: "flex",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
  },
  active: { backgroundColor: tokens.colorNeutralBackground1Selected, "--ui-muted": "var(--ui-muted-on-select)" } as never,
  keys: { color: "var(--ui-muted)" },
});

interface Command {
  title: string;
  keys?: string;
  run: () => void;
}

/** All editor commands (FR-UX-02). Each one also has a menu, a button, or a key. */
function commands(): Command[] {
  const st = useEditor.getState();
  const tools: Command[] = TOOLS.map((t) => ({ title: `Tool: ${t.label}`, keys: t.key, run: () => st.setTool(t.tool as Tool) }));
  return [
    { title: "Export video or images", keys: "Ctrl+E", run: () => useEditor.setState({ exportOpen: true }) },
    { title: "Present step by step", keys: "F5", run: () => (st.pause(), useEditor.setState({ presenting: true })) },
    { title: "Play or pause", keys: "Space", run: () => (st.playing ? st.pause() : st.play()) },
    { title: "Add step", keys: "N", run: addStep },
    { title: "Insert image", run: () => void withErrors(pickImage) },
    { title: "Insert table", run: () => void insertTable() },
    { title: "Add voiceover", run: () => void withErrors(() => importAudio("voiceover")) },
    { title: "Add music", run: () => void withErrors(() => importAudio("music")) },
    { title: "Add sound effect", run: () => void withErrors(() => importAudio("sfx")) },
    { title: "Record voiceover in one take", run: () => void withErrors(startRecording) },
    { title: "Record voiceover step by step", run: () => void withErrors(async () => openTakes()) },
    { title: "Align script to voiceover", run: () => useEditor.setState({ alignOpen: true }) },
    { title: "Show or hide the timeline", run: () => useEditor.setState({ timelineOpen: !useEditor.getState().timelineOpen }) },
    { title: "Make voiceover from script", run: () => useEditor.setState({ ttsOpen: true }) },
    { title: "Edit script", run: () => useEditor.setState({ scriptOpen: true }) },
    { title: "Start all steps at voiceover cues", run: cueAllSteps },
    { title: "Save", keys: "Ctrl+S", run: () => void withErrors(async () => (await saveFile()) && notify("Saved", "success")) },
    { title: "Save as", keys: "Ctrl+Shift+S", run: () => void withErrors(saveFileAs) },
    { title: "Open", keys: "Ctrl+O", run: () => void withErrors(openFile) },
    { title: "New scene", run: () => newScene() },
    ...WIDGETS.map((w) => ({ title: `Insert widget: ${w.title}`, run: () => insertWidget(w) })),
    { title: "Save the selection as a widget", run: () => useEditor.setState({ saveWidgetOpen: true }) },
    { title: "Bullet list build", run: () => useEditor.setState({ buildOpen: true }) },
    { title: "Go to the home screen", run: () => void goHome() },
    { title: "Templates gallery", run: () => useEditor.setState({ galleryOpen: true }) },
    { title: "Import Excalidraw or Mermaid", run: () => void withErrors(runImport) },
    ...TEMPLATES.map((t) => ({ title: `New from template: ${t.title}`, run: () => void withErrors(() => newFromTemplate(t.name)) })),
    { title: "Undo", keys: "Ctrl+Z", run: () => st.undo() },
    { title: "Redo", keys: "Ctrl+Shift+Z", run: () => st.redo() },
    { title: "Select all", keys: "Ctrl+A", run: selectAll },
    { title: "Copy", keys: "Ctrl+C", run: () => void copySelection() },
    { title: "Paste", keys: "Ctrl+V", run: () => void pasteFromClipboard() },
    { title: "Duplicate", keys: "Ctrl+D", run: duplicateSelection },
    { title: "Delete", keys: "Delete", run: deleteSelection },
    { title: "Group", keys: "Ctrl+G", run: groupSelection },
    { title: "Lock or unlock", keys: "Ctrl+Shift+L", run: toggleLockSelection },
    { title: "Hide or show in editor", keys: "Ctrl+Shift+H", run: toggleHideSelection },
    { title: "Unlock and show all elements", run: unlockAndShowAll },
    { title: "Ungroup", keys: "Ctrl+Shift+G", run: ungroupSelection },
    { title: "Align left", run: () => alignSelection("left") },
    { title: "Align center", run: () => alignSelection("center") },
    { title: "Align right", run: () => alignSelection("right") },
    { title: "Align top", run: () => alignSelection("top") },
    { title: "Align middle", run: () => alignSelection("middle") },
    { title: "Align bottom", run: () => alignSelection("bottom") },
    { title: "Distribute horizontally", run: () => distributeSelection("horizontal") },
    { title: "Distribute vertically", run: () => distributeSelection("vertical") },
    ...(["row", "column", "grid", "layered", "tree"] as const).map((k) => ({ title: `Auto layout: ${k}`, run: () => autoLayoutSelection(k) })),
    { title: "Style: clean", run: () => commitSettings({ style: "clean" }, "Change style") },
    { title: "Style: sketch", run: () => commitSettings({ style: "sketch" }, "Change style") },
    ...["slate-dark", "slate-light", "paper-light", "night-dark", "pop-light", "neon-dark"].map((t) => ({ title: `Theme: ${t}`, run: () => commitSettings({ theme: t }, "Change theme") })),
    ...(shareServer() ? [{ title: "Share link", run: () => useEditor.setState({ shareOpen: true }) }] : []),
    { title: "Keyboard shortcuts", keys: "?", run: () => useEditor.setState({ helpOpen: true }) },
    { title: "History of changes", run: () => useEditor.setState({ historyOpen: true }) },
    { title: "AI panel", run: () => useEditor.setState((s) => ({ aiOpen: !s.aiOpen })) },
    { title: "Connect agent", run: () => useEditor.setState({ connectOpen: true }) },
    { title: "Show the tour", run: () => useEditor.setState({ tourOpen: true }) },
    { title: "Edit custom theme", run: () => useEditor.setState({ themeEditorOpen: true }) },
    { title: "Fit video to screen", keys: "Shift+1", run: () => st.fitToVideo() },
    ...tools,
  ];
}

/** Simple fuzzy match: all query words appear in the title. */
function matches(title: string, query: string): boolean {
  const t = title.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w));
}

export function CommandPalette() {
  const styles = useStyles();
  const open = useEditor((s) => s.paletteOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => (open ? commands().filter((c) => matches(c.title, query)) : []), [open, query]);

  const close = () => {
    useEditor.setState({ paletteOpen: false });
    setQuery("");
    setActive(0);
  };
  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    // Run after the dialog closes, so focus returns to the editor first.
    setTimeout(c.run, 0);
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface} aria-label="Command palette">
        <DialogBody style={{ display: "block" }}>
          <Input
            autoFocus
            contentBefore={<Search20Regular />}
            placeholder="Type a command"
            aria-label="Command"
            value={query}
            style={{ width: "100%" }}
            onChange={(_, d) => {
              setQuery(d.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(list.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(list[active]);
              } else if (e.key === "Escape") close();
            }}
          />
          <div className={styles.list} role="listbox" aria-label="Commands" tabIndex={0}>
            {list.map((c, i) => (
              <div key={c.title} role="option" aria-selected={i === active} className={mergeClasses(styles.item, i === active && styles.active)} onMouseEnter={() => setActive(i)} onClick={() => run(c)}>
                <Text>{c.title}</Text>
                {c.keys && (
                  <Text size={200} className={styles.keys}>
                    {c.keys}
                  </Text>
                )}
              </div>
            ))}
            {list.length === 0 && <Text style={{ padding: 8 }}>No command matches "{query}".</Text>}
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
