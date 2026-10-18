import { FluentProvider, Spinner, Text, Toast, ToastTitle, Toaster, makeStyles, tokens, useId, useToastController } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { loadAssets } from "../assets.js";
import { openSceneFromQuery, startAutosave } from "../files.js";
import { migrateAutosave, startLibraryAutosave } from "../library.js";
import { Home } from "./Home.js";
import { openShareFromUrl } from "../share.js";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";
import { darkTheme, lightTheme } from "../theme.js";
import { CanvasView } from "./CanvasView.js";
import { CommandPalette } from "./CommandPalette.js";
import { ExportDialog } from "./ExportDialog.js";
import { IconPicker } from "./IconPicker.js";
import { Inspector } from "./Inspector.js";
import { startAudioSync } from "../audio.js";
import { startImageSync } from "../images.js";
import { AgentPanel, ConnectAgentDialog } from "./AgentPanel.js";
import { AiPanel } from "./AiPanel.js";
import { HistoryDialog, ShortcutHelp } from "./HelpDialogs.js";
import { ShareDialog } from "./ShareDialog.js";
import { TtsDialog } from "./TtsDialog.js";
import { AlignDialog } from "./AlignDialog.js";
import { AudioLane } from "./AudioLane.js";
import { PlaybackBar } from "./PlaybackBar.js";
import { TakesBar } from "./TakesBar.js";
import { RecordBar } from "./RecordBar.js";
import { ScriptDialog } from "./ScriptDialog.js";
import { TemplateGallery } from "./TemplateGallery.js";
import { ThemeEditor } from "./ThemeEditor.js";
import { Tour } from "./Tour.js";
import { TimelinePanel } from "./TimelinePanel.js";
import { PresentMode } from "./PresentMode.js";
import { StepsPanel } from "./StepsPanel.js";
import { TopBar } from "./TopBar.js";
import { useShortcuts } from "./shortcuts.js";

const useStyles = makeStyles({
  root: {
    height: "100%",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    gridTemplateColumns: "220px minmax(0, 1fr) 280px",
    gridTemplateAreas: `"top top top" "steps canvas inspector" "play play play"`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  top: { gridArea: "top" },
  steps: { gridArea: "steps", display: "grid", minHeight: 0 },
  canvas: { gridArea: "canvas", display: "grid", minHeight: 0, minWidth: 0 },
  inspector: { gridArea: "inspector", display: "grid", minHeight: 0 },
  play: { gridArea: "play" },
  center: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: tokens.spacingHorizontalM },
});

function usePrefersDark(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

export function App() {
  const styles = useStyles();
  const dark = usePrefersDark();
  const [state, setState] = useState<"loading" | "ready" | { error: string }>("loading");
  useShortcuts();
  useEffect(() => startAutosave(), []);
  useEffect(() => startLibraryAutosave(), []);
  useEffect(() => startAudioSync(), []);
  useEffect(() => startImageSync(), []);
  // WebMCP: the browser's agent can use the editor tools, if the browser supports it.
  useEffect(() => {
    let stop: (() => void) | null = null;
    void import("../ai/webmcp.js").then((m) => (stop = m.startWebMcp()));
    return () => stop?.();
  }, []);
  const toasterId = useId("toaster");
  const { dispatchToast } = useToastController(toasterId);
  const notice = useEditor((s) => s.notice);
  const presenting = useEditor((s) => s.presenting);
  const recording = useEditor((s) => s.recording !== null);
  const takes = useEditor((s) => s.takes !== null);
  const timelineOpen = useEditor((s) => s.timelineOpen);
  const screen = useEditor((s) => s.screen);
  useEffect(() => {
    if (!notice) return;
    dispatchToast(
      <Toast>
        <ToastTitle>{notice.text}</ToastTitle>
      </Toast>,
      { intent: notice.intent, timeout: notice.intent === "error" ? 8000 : 2500, position: "bottom" },
    );
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAssets();
        // The scenes of older versions go into the library (FR-FILE-03). The app starts on the home screen.
        await migrateAutosave().catch(() => undefined);
        if (cancelled) return;
        // anivo serve: ?scene=/local/scene opens the scene from this server.
        await openSceneFromQuery().catch((e: unknown) => notify(e instanceof Error ? e.message : String(e), "error"));
        // A share link (#share=…) opens the shared scene (FR-SHARE-01).
        await openShareFromUrl().catch((e: unknown) => notify(e instanceof Error ? e.message : String(e), "error"));
        setState("ready");
      } catch (err) {
        setState({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // No className on the provider: Fluent copies the provider class onto portal nodes (menus,
  // dropdowns). A height of 100% on a portal node covers the page and blocks clicks.
  // index.html sets the height of the root provider.
  return (
    <FluentProvider theme={dark ? darkTheme : lightTheme}>
      {state === "loading" ? (
        <div className={styles.center}>
          <Spinner label="Loading Anivo" />
        </div>
      ) : typeof state === "object" ? (
        <div className={styles.center}>
          <Text>Anivo did not start. {state.error} Reload the page.</Text>
        </div>
      ) : screen === "home" ? (
        <Home />
      ) : (
        <div className={styles.root}>
          <div className={styles.top}>
            <TopBar />
          </div>
          <div className={styles.steps}>
            <StepsPanel />
          </div>
          <div className={styles.canvas} style={{ position: "relative" }}>
            <CanvasView />
            <AgentPanel />
            <AiPanel />
          </div>
          <div className={styles.inspector}>
            <Inspector />
          </div>
          <div className={styles.play}>
            {recording ? (
              <RecordBar />
            ) : takes ? (
              <TakesBar />
            ) : (
              <>
                {timelineOpen && <TimelinePanel />}
                <AudioLane />
                <PlaybackBar />
              </>
            )}
          </div>
          <Toaster toasterId={toasterId} />
          {/* Outside the canvas tree: React events from a dialog portal bubble to its React parents. */}
          <IconPicker />
          <ExportDialog />
          <ScriptDialog />
          <AlignDialog />
          <TemplateGallery />
          <ThemeEditor />
          <Tour />
          <ConnectAgentDialog />
          <ShortcutHelp />
          <ShareDialog />
          <TtsDialog />
          <HistoryDialog />
          <CommandPalette />
          {presenting && <PresentMode />}
        </div>
      )}
    </FluentProvider>
  );
}
