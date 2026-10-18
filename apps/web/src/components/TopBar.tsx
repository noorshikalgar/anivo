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
import { ArrowExportUp20Regular, Play20Regular, ArrowRedo20Regular, ArrowUndo20Regular, Document20Regular, FolderOpen20Regular, Mic20Regular, MusicNote220Regular, Record20Regular, Save20Regular, ZoomFit20Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { hasFileSystemAccess, newFromTemplate, newScene, openFile, runImport, openRecent, recentFiles, saveFile, saveFileAs } from "../files.js";
import { notify, withErrors } from "../notify.js";
import { cueAllSteps, importAudio } from "../audio.js";
import { startRecording } from "../record.js";
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

export const TEMPLATES = [
  { name: "load-balancer", title: "How a load balancer works" },
  { name: "tcp-handshake", title: "TCP three-way handshake" },
  { name: "docker-layers", title: "Docker image layers" },
];

export function TopBar() {
  const styles = useStyles();
  const title = useEditor((s) => s.scene.meta.title);
  const fileName = useEditor((s) => s.fileName);
  const dirty = useEditor((s) => s.dirty);
  const hasVoice = useEditor((s) => s.scene.audio.some((t) => t.kind === "voiceover"));
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
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <MenuItem>New from template</MenuItem>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {TEMPLATES.map((t) => (
                    <MenuItem key={t.name} onClick={() => void withErrors(() => newFromTemplate(t.name))}>
                      {t.title}
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
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
              Record voiceover…
            </MenuItem>
            <MenuDivider />
            <MenuItem onClick={() => useEditor.setState({ scriptOpen: true })}>Edit script…</MenuItem>
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
        <ToolbarDivider />
        <Tooltip content="Fit video to screen (Shift+1)" relationship="label">
          <Button appearance="subtle" icon={<ZoomFit20Regular />} onClick={fitToVideo} />
        </Tooltip>
      </Toolbar>
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
