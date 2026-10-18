import { FluentProvider, Spinner, Text, Toast, ToastTitle, Toaster, makeStyles, tokens, useId, useToastController } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { loadAssets, loadTemplate } from "../assets.js";
import { restoreAutosave, startAutosave } from "../files.js";
import { useEditor } from "../store.js";
import { darkTheme, lightTheme } from "../theme.js";
import { CanvasView } from "./CanvasView.js";
import { CommandPalette } from "./CommandPalette.js";
import { ExportDialog } from "./ExportDialog.js";
import { IconPicker } from "./IconPicker.js";
import { Inspector } from "./Inspector.js";
import { startAudioSync } from "../audio.js";
import { AlignDialog } from "./AlignDialog.js";
import { AudioLane } from "./AudioLane.js";
import { PlaybackBar } from "./PlaybackBar.js";
import { RecordBar } from "./RecordBar.js";
import { ScriptDialog } from "./ScriptDialog.js";
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
  useEffect(() => startAudioSync(), []);
  const toasterId = useId("toaster");
  const { dispatchToast } = useToastController(toasterId);
  const notice = useEditor((s) => s.notice);
  const presenting = useEditor((s) => s.presenting);
  const recording = useEditor((s) => s.recording !== null);
  const timelineOpen = useEditor((s) => s.timelineOpen);
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
        // Restore the last session (FR-FILE-03). Start with the template on the first visit.
        const restored = await restoreAutosave();
        if (!restored) {
          const scene = await loadTemplate("load-balancer");
          if (cancelled) return;
          useEditor.getState().openScene(scene);
          useEditor.setState({ dirty: false });
        }
        if (cancelled) return;
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
      ) : (
        <div className={styles.root}>
          <div className={styles.top}>
            <TopBar />
          </div>
          <div className={styles.steps}>
            <StepsPanel />
          </div>
          <div className={styles.canvas}>
            <CanvasView />
          </div>
          <div className={styles.inspector}>
            <Inspector />
          </div>
          <div className={styles.play}>
            {recording ? (
              <RecordBar />
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
          <CommandPalette />
          {presenting && <PresentMode />}
        </div>
      )}
    </FluentProvider>
  );
}
