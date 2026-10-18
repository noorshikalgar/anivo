import {
  Button,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowExportUp20Regular, Play20Regular, ArrowRedo20Regular, ArrowUndo20Regular, Document20Regular, History20Regular, FolderOpen20Regular, Bot20Regular, Mic20Regular, Sparkle20Regular, MusicNote220Regular, Record20Regular, Save20Regular, ZoomFit20Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { hasFileSystemAccess, newScene, openFile, runImport, openRecent, recentFiles, saveFile, saveFileAs } from "../files.js";
import { notify, withErrors } from "../notify.js";
import { cueAllSteps, importAudio } from "../audio.js";
import { startRecording } from "../record.js";
import { openTakes } from "../takes.js";
import { shareServer } from "../share.js";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `0 ${tokens.spacingHorizontalM}`,
    height: "48px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  brand: { fontWeight: tokens.fontWeightSemibold, letterSpacing: "0.02em", marginRight: tokens.spacingHorizontalS },
  title: { color: tokens.colorNeutralForeground3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  spacer: { flexGrow: 1 },
});

export { TEMPLATES } from "@anivo/schema";

export function TopBar() {
  const styles = useStyles();
  const title = useEditor((s) => s.scene.meta.title);
  const fileName = useEditor((s) => s.fileName);
  const dirty = useEditor((s) => s.dirty);
  const hasVoice = useEditor((s) => s.scene.audio.some((t) => t.kind === "voiceover"));
  const agentOn = useEditor((s) => s.agent !== null);
  useEditor((s) => s.version);
  const { bus, undo, redo, fitToVideo } = useEditor.getState();
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof recentFiles>>>([]);

  return (
    <header className={styles.root}>
      <Text size={400} className={styles.brand}>
        Anivo
      </Text>
      <Menu onOpenChange={(_, d) => d.open && void recentFiles().then(setRecent)}>
        <MenuTrigger disableButtonEnhancement>
          <Button appearance="subtle" size="small">
            File
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem icon={<Document20Regular />} onClick={newScene}>
              New scene
            </MenuItem>
            <MenuItem onClick={() => useEditor.setState({ galleryOpen: true })}>New from template…</MenuItem>
            <MenuItem onClick={() => void withErrors(runImport)}>Import Excalidraw or Mermaid…</MenuItem>
            <MenuDivider />
            <MenuItem icon={<FolderOpen20Regular />} secondaryContent="Ctrl+O" onClick={() => void withErrors(openFile)}>
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
            <MenuItem icon={<Save20Regular />} secondaryContent="Ctrl+S" onClick={() => void withErrors(async () => (await saveFile()) && notify("Saved", "success"))}>
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
          </MenuList>
        </MenuPopover>
      </Menu>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button appearance="subtle" size="small">
            Audio
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem icon={<Mic20Regular />} onClick={() => void withErrors(() => importAudio("voiceover"))}>
              Add voiceover…
            </MenuItem>
            <MenuItem icon={<MusicNote220Regular />} onClick={() => void withErrors(() => importAudio("music"))}>
              Add music…
            </MenuItem>
            <MenuItem onClick={() => void withErrors(() => importAudio("sfx"))}>Add sound effect…</MenuItem>
            <MenuItem icon={<Record20Regular />} onClick={() => void withErrors(startRecording)}>
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
          </MenuList>
        </MenuPopover>
      </Menu>
      <Text size={300} className={styles.title} title={fileName ?? undefined}>
        {title}
        {fileName ? ` · ${fileName}` : ""}
        {dirty ? " •" : ""}
      </Text>
      <div className={styles.spacer} />
      <Toolbar aria-label="Edit" size="small">
        <Tooltip content="Undo (Ctrl+Z)" relationship="label">
          <ToolbarButton icon={<ArrowUndo20Regular />} onClick={undo} disabled={!bus.canUndo} />
        </Tooltip>
        <Tooltip content="Redo (Ctrl+Shift+Z)" relationship="label">
          <ToolbarButton icon={<ArrowRedo20Regular />} onClick={redo} disabled={!bus.canRedo} />
        </Tooltip>
        <Tooltip content="History" relationship="label">
          <ToolbarButton icon={<History20Regular />} onClick={() => useEditor.setState({ historyOpen: true })} />
        </Tooltip>
        <ToolbarDivider />
        <Tooltip content="Fit video to screen (Shift+1)" relationship="label">
          <Button appearance="subtle" icon={<ZoomFit20Regular />} onClick={fitToVideo} />
        </Tooltip>
      </Toolbar>
      <Button appearance="subtle" size="small" icon={<Sparkle20Regular />} onClick={() => useEditor.setState((s) => ({ aiOpen: !s.aiOpen }))}>
        AI
      </Button>
      {!agentOn && (
        <Button appearance="subtle" size="small" icon={<Bot20Regular />} onClick={() => useEditor.setState({ connectOpen: true })}>
          Connect agent
        </Button>
      )}
      <Tooltip content="Present step by step (F5)" relationship="label">
        <Button appearance="secondary" size="small" icon={<Play20Regular />} onClick={() => (useEditor.getState().pause(), useEditor.setState({ presenting: true }))}>
          Present
        </Button>
      </Tooltip>
      <Tooltip content="Export video or images (Ctrl+E)" relationship="label">
        <Button appearance="primary" size="small" icon={<ArrowExportUp20Regular />} onClick={() => useEditor.setState({ exportOpen: true })}>
          Export
        </Button>
      </Tooltip>
    </header>
  );
}
