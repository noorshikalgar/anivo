/**
 * The top bar (docs/15): the menus, the scene title, and the main commands.
 */
import { Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger, Tooltip, makeStyles, mergeClasses } from "@fluentui/react-components";
import {
  ArrowExportUp16Regular,
  ArrowRedo16Regular,
  ArrowUndo16Regular,
  Bot16Regular,
  Copy16Regular,
  Delete16Regular,
  Document16Regular,
  FolderOpen16Regular,
  History16Regular,
  Home16Regular,
  Keyboard16Regular,
  Mic16Regular,
  MusicNote216Regular,
  PanelRight16Regular,
  Play16Regular,
  Record16Regular,
  Save16Regular,
  Search16Regular,
  Sparkle16Regular,
  TextBulletListLtr16Regular,
  ZoomFit16Regular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { deleteSelection, duplicateSelection, insertTable } from "../commands.js";
import { pickImage } from "../images.js";
import { WIDGETS, insertWidget } from "../widgets.js";
import { goHome, hasFileSystemAccess, newScene, openFile, openRecent, recentFiles, runImport, saveFile, saveFileAs } from "../files.js";
import { notify, withErrors } from "../notify.js";
import { cueAllSteps, importAudio } from "../audio.js";
import { startRecording } from "../record.js";
import { openTakes } from "../takes.js";
import { shareServer } from "../share.js";
import { useEditor } from "../store.js";
import { MenuButtonSmall } from "./ui.js";
import { COMPACT, PHONE, useMedia } from "./useMedia.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    height: "30px",
    padding: "0 6px",
    minWidth: 0,
    overflow: "hidden",
    backgroundColor: "var(--ui-header)",
    color: "var(--ui-text)",
    fontSize: "12px",
  },
  brand: { fontWeight: 600, marginRight: "6px", gap: "6px", padding: "0 8px" },
  menu: {
    height: "22px",
    padding: "0 8px",
    border: "none",
    borderRadius: "4px",
    background: "none",
    color: "var(--ui-text)",
    font: "inherit",
    fontSize: "12px",
    cursor: "pointer",
    ":hover": { backgroundColor: "var(--ui-hover)" },
    "[aria-expanded='true']": { backgroundColor: "var(--ui-select)", color: "#fff" },
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
  },
  title: { flexGrow: 1, minWidth: 0, textAlign: "center", color: "var(--ui-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 12px" },
  titleName: { color: "var(--ui-text)" },
  group: { display: "flex", alignItems: "center", gap: "2px" },
  sep: { width: "1px", height: "16px", backgroundColor: "var(--ui-line)", margin: "0 4px" },
  primary: { backgroundColor: "var(--ui-select)", color: "#fff", ":hover": { backgroundColor: "#5580bd" } },
});

export { TEMPLATES } from "@anivo/schema";

/** A top-bar menu: a text button that opens a menu. */
function BarMenu({ label, icon, children, onOpen }: { label: string; icon?: React.ReactElement; children: React.ReactNode; onOpen?: () => void }) {
  const s = useStyles();
  const phone = useMedia(PHONE);
  return (
    <Menu onOpenChange={(_, d) => d.open && onOpen?.()}>
      <MenuTrigger disableButtonEnhancement>
        <MenuButtonSmall className={s.menu} aria-label={label} iconOnly={phone && !!icon} icon={phone ? icon : undefined}>
          {label}
        </MenuButtonSmall>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>{children}</MenuList>
      </MenuPopover>
    </Menu>
  );
}

export function TopBar() {
  const s = useStyles();
  const title = useEditor((st) => st.scene.meta.title);
  const fileName = useEditor((st) => st.fileName);
  const dirty = useEditor((st) => st.dirty);
  const hasVoice = useEditor((st) => st.scene.audio.some((t) => t.kind === "voiceover"));
  const agentOn = useEditor((st) => st.agent !== null);
  const timelineOpen = useEditor((st) => st.timelineOpen);
  const hasSelection = useEditor((st) => st.selection.length > 0);
  const drawer = useEditor((st) => st.drawer);
  const compact = useMedia(COMPACT);
  const phone = useMedia(PHONE);
  const toggle = (d: "steps" | "inspector") => useEditor.setState((st) => ({ drawer: st.drawer === d ? null : d }));
  useEditor((st) => st.version);
  const { bus, undo, redo, fitToVideo } = useEditor.getState();
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof recentFiles>>>([]);
  const tool = (label: string, icon: React.ReactElement, onClick: () => void, opts: { text?: string; primary?: boolean; pressed?: boolean; disabled?: boolean } = {}) => (
    <Tooltip content={label} relationship="description" withArrow={false}>
      <MenuButtonSmall className={mergeClasses(s.menu, opts.primary && s.primary)} aria-label={opts.text ?? label} aria-pressed={opts.pressed} disabled={opts.disabled} icon={icon} iconOnly={!opts.text || compact} onClick={onClick}>
        {opts.text}
      </MenuButtonSmall>
    </Tooltip>
  );

  return (
    <header className={s.root}>
      <Tooltip content="Home: all your scenes" relationship="description" withArrow={false}>
        <MenuButtonSmall className={mergeClasses(s.menu, s.brand)} icon={<Home16Regular />} aria-label="Home" onClick={() => void withErrors(goHome)}>
          {phone ? null : "Anivo"}
        </MenuButtonSmall>
      </Tooltip>
      {compact && tool("Steps", <TextBulletListLtr16Regular />, () => toggle("steps"), { pressed: drawer === "steps" })}
      <BarMenu label="File" icon={<Document16Regular />} onOpen={() => void recentFiles().then(setRecent)}>
        <MenuItem icon={<Document16Regular />} onClick={() => newScene()}>
          New scene
        </MenuItem>
        <MenuItem onClick={() => useEditor.setState({ galleryOpen: true })}>New from template…</MenuItem>
        <MenuItem onClick={() => void withErrors(runImport)}>Import Excalidraw or Mermaid…</MenuItem>
        <MenuDivider />
        <MenuItem icon={<FolderOpen16Regular />} secondaryContent="Ctrl+O" onClick={() => void withErrors(openFile)}>
          Open…
        </MenuItem>
        {hasFileSystemAccess && (
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuItem disabled={recent.length === 0}>Open recent</MenuItem>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {recent.map((r) => (
                  <MenuItem key={r.name} onClick={() => void withErrors(() => openRecent(r))}>
                    {r.name}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        )}
        <MenuDivider />
        <MenuItem icon={<Save16Regular />} secondaryContent="Ctrl+S" onClick={() => void withErrors(async () => (await saveFile()) && notify("Saved", "success"))}>
          Save
        </MenuItem>
        <MenuItem secondaryContent="Ctrl+Shift+S" onClick={() => void withErrors(async () => (await saveFileAs()) && notify("Saved", "success"))}>
          Save as…
        </MenuItem>
        {shareServer() && (
          <>
            <MenuDivider />
            <MenuItem onClick={() => useEditor.setState({ shareOpen: true })}>Share link…</MenuItem>
          </>
        )}
        <MenuDivider />
        <MenuItem icon={<ArrowExportUp16Regular />} secondaryContent="Ctrl+E" onClick={() => useEditor.setState({ exportOpen: true })}>
          Export…
        </MenuItem>
        <MenuItem icon={<Home16Regular />} onClick={() => void withErrors(goHome)}>
          Home
        </MenuItem>
      </BarMenu>
      {!phone && (
        <BarMenu label="Edit">
          <MenuItem icon={<ArrowUndo16Regular />} secondaryContent="Ctrl+Z" disabled={!bus.canUndo} onClick={undo}>
            Undo
          </MenuItem>
          <MenuItem icon={<ArrowRedo16Regular />} secondaryContent="Ctrl+Shift+Z" disabled={!bus.canRedo} onClick={redo}>
            Redo
          </MenuItem>
          <MenuItem icon={<History16Regular />} onClick={() => useEditor.setState({ historyOpen: true })}>
            History…
          </MenuItem>
          <MenuDivider />
          <MenuItem icon={<Copy16Regular />} secondaryContent="Ctrl+D" disabled={!hasSelection} onClick={duplicateSelection}>
            Duplicate
          </MenuItem>
          <MenuItem icon={<Delete16Regular />} secondaryContent="Delete" disabled={!hasSelection} onClick={deleteSelection}>
            Delete
          </MenuItem>
          <MenuItem disabled={!hasSelection} onClick={() => useEditor.setState({ saveWidgetOpen: true })}>
            Save as widget…
          </MenuItem>
          <MenuDivider />
          <MenuItem icon={<Search16Regular />} secondaryContent="F3" onClick={() => useEditor.setState({ paletteOpen: true })}>
            Search commands…
          </MenuItem>
        </BarMenu>
      )}
      {!phone && (
        <BarMenu label="View">
          <MenuItem icon={<ZoomFit16Regular />} secondaryContent="Shift+1" onClick={fitToVideo}>
            Fit the video
          </MenuItem>
          <MenuItem secondaryContent="T" onClick={() => useEditor.setState((st) => ({ timelineOpen: !st.timelineOpen }))}>
            {timelineOpen ? "Hide the timeline" : "Show the timeline"}
          </MenuItem>
          <MenuDivider />
          <MenuItem icon={<Play16Regular />} secondaryContent="F5" onClick={() => (useEditor.getState().pause(), useEditor.setState({ presenting: true }))}>
            Present
          </MenuItem>
        </BarMenu>
      )}
      {!phone && (
        <BarMenu label="Insert">
          <MenuItem onClick={() => useEditor.setState({ buildOpen: true })}>Bullet list build…</MenuItem>
          <MenuItem onClick={() => useEditor.setState({ messageOpen: true })}>Message (type, then send)…</MenuItem>
          <MenuDivider />
          <MenuItem onClick={() => insertTable()}>Table</MenuItem>
          <MenuItem onClick={() => void withErrors(pickImage)}>Image…</MenuItem>
          <MenuDivider />
          {WIDGETS.map((w) => (
            <MenuItem key={w.name} onClick={() => insertWidget(w)}>
              {`Widget: ${w.title}`}
            </MenuItem>
          ))}
        </BarMenu>
      )}
      <BarMenu label="Audio" icon={<Mic16Regular />}>
        <MenuItem icon={<Mic16Regular />} onClick={() => void withErrors(() => importAudio("voiceover"))}>
          Add voiceover…
        </MenuItem>
        <MenuItem icon={<MusicNote216Regular />} onClick={() => void withErrors(() => importAudio("music"))}>
          Add music…
        </MenuItem>
        <MenuItem onClick={() => void withErrors(() => importAudio("sfx"))}>Add sound effect…</MenuItem>
        <MenuDivider />
        <MenuItem icon={<Record16Regular />} onClick={() => void withErrors(startRecording)}>
          Record voiceover in one take…
        </MenuItem>
        <MenuItem onClick={() => void withErrors(async () => openTakes())}>Record voiceover step by step…</MenuItem>
        <MenuDivider />
        <MenuItem onClick={() => useEditor.setState({ scriptOpen: true })}>Edit script…</MenuItem>
        <MenuItem onClick={() => useEditor.setState({ ttsOpen: true })}>Make voiceover from script…</MenuItem>
        <MenuItem disabled={!hasVoice} onClick={() => useEditor.setState({ alignOpen: true })}>
          Align script to voiceover…
        </MenuItem>
        <MenuItem disabled={!hasVoice} onClick={cueAllSteps}>
          Start all steps at voiceover cues
        </MenuItem>
      </BarMenu>
      {!phone && (
        <BarMenu label="Help">
          <MenuItem icon={<Keyboard16Regular />} secondaryContent="?" onClick={() => useEditor.setState({ helpOpen: true })}>
            Keyboard shortcuts
          </MenuItem>
          <MenuItem onClick={() => useEditor.setState({ tourOpen: true })}>Show the tour</MenuItem>
        </BarMenu>
      )}
      <div className={s.title} title={fileName ?? undefined} style={phone ? { visibility: "hidden" } : undefined}>
        <span className={s.titleName}>{title}</span>
        {fileName ? ` · ${fileName}` : ""}
        {dirty ? " •" : ""}
      </div>
      <div className={s.group}>
        {!phone && tool("Undo (Ctrl+Z)", <ArrowUndo16Regular />, undo, { disabled: !bus.canUndo })}
        {!phone && tool("Redo (Ctrl+Shift+Z)", <ArrowRedo16Regular />, redo, { disabled: !bus.canRedo })}
        <span className={s.sep} />
        {tool("AI panel", <Sparkle16Regular />, () => useEditor.setState((st) => ({ aiOpen: !st.aiOpen })), { text: "AI" })}
        {!agentOn && !phone && tool("Connect an agent (Claude Code, Cursor) to this editor", <Bot16Regular />, () => useEditor.setState({ connectOpen: true }), { text: "Connect agent" })}
        {!phone && tool("Present step by step (F5)", <Play16Regular />, () => (useEditor.getState().pause(), useEditor.setState({ presenting: true })), { text: "Present" })}
        {tool("Export video or images (Ctrl+E)", <ArrowExportUp16Regular />, () => useEditor.setState({ exportOpen: true }), { text: "Export", primary: true })}
        {compact && tool("Properties", <PanelRight16Regular />, () => toggle("inspector"), { pressed: drawer === "inspector" })}
      </div>
    </header>
  );
}
