import { FluentProvider, Spinner, Text, Toast, ToastTitle, Toaster, makeStyles, mergeClasses, tokens, useId, useToastController } from "@fluentui/react-components";
import { useEffect, useRef, useState } from "react";
import { loadAssets } from "../assets.js";
import { openSceneFromQuery, startAutosave } from "../files.js";
import { migrateAutosave, startLibraryAutosave } from "../library.js";
import { Home } from "./Home.js";
import { SaveWidgetDialog } from "./SaveWidgetDialog.js";
import { BuildDialog } from "./BuildDialog.js";
import { MessageDialog } from "./MessageDialog.js";
import { Outliner } from "./Outliner.js";
import { ViewportHeader } from "./ViewportHeader.js";
import { StatusBar } from "./StatusBar.js";
import { COMPACT, useMedia } from "./useMedia.js";
import { Splitter } from "./ui.js";
import { openShareFromUrl } from "../share.js";
import { notify } from "../notify.js";
import { setAreas, useEditor } from "../store.js";
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
    gridTemplateRows: "auto minmax(0, 1fr) auto auto",
    gridTemplateColumns: "230px minmax(0, 1fr) 300px",
    gridTemplateAreas: `"top top top" "steps canvas right" "play play play" "status status status"`,
    gap: "2px",
    backgroundColor: "var(--ui-app)",
    color: "var(--ui-text)",
  },
  medium: { gridTemplateColumns: "200px minmax(0, 1fr) 270px" },
  // Small windows: the canvas uses the full width; the panels are drawers over it.
  compact: { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateAreas: `"top" "canvas" "play" "status"` },
  maximized: { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "auto minmax(0, 1fr) auto", gridTemplateAreas: `"top" "canvas" "status"` },
  gone: { display: "none !important" },
  top: { gridArea: "top", minWidth: 0 },
  // Areas: round corners and a 2 px gap, as in Blender.
  area: { borderRadius: "6px", overflow: "hidden", minHeight: 0, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" },
  steps: { gridArea: "steps", display: "grid", marginLeft: "2px", position: "relative" },
  canvas: { gridArea: "canvas", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" },
  stage: { position: "relative", display: "grid", minHeight: 0, minWidth: 0 },
  right: { gridArea: "right", display: "flex", flexDirection: "column", gap: "2px", marginRight: "2px", minHeight: 0, minWidth: 0, position: "relative" },
  outliner: { flex: "0 0 34%", display: "grid", minHeight: "80px" },
  inspector: { flex: "1 1 0", display: "grid" },
  play: { gridArea: "play", minWidth: 0, margin: "0 2px" },
  status: { gridArea: "status", minWidth: 0 },
  drawer: {
    position: "fixed",
    top: "32px",
    bottom: 0,
    width: "min(320px, 88vw)",
    zIndex: 30,
    display: "grid",
    minHeight: 0,
    boxShadow: tokens.shadow28,
    backgroundColor: tokens.colorNeutralBackground2,
    transitionProperty: "transform",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveDecelerateMid,
  },
  drawerLeft: { left: 0, transform: "translateX(-105%)" },
  drawerRight: { right: 0, transform: "translateX(105%)", gridTemplateRows: "minmax(0, 34%) minmax(0, 1fr)", gap: "2px", backgroundColor: "var(--ui-app)" },
  drawerOpen: { transform: "none" },
  scrim: { position: "fixed", inset: "32px 0 0 0", zIndex: 29, backgroundColor: "rgba(0,0,0,0.35)" },
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
  useEffect(() => {
    document.documentElement.dataset["ui"] = dark ? "dark" : "light";
  }, [dark]);
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
  const drawer = useEditor((s) => s.drawer);
  const maximized = useEditor((s) => s.maximized);
  const areas = useEditor((s) => s.areas);
  const startAreas = useRef(areas);
  const compact = useMedia(COMPACT);
  const medium = useMedia("(max-width: 1279px)");
  useEffect(() => {
    if (!compact) useEditor.setState({ drawer: null });
  }, [compact]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useEditor.getState().drawer) useEditor.setState({ drawer: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
        <div className={mergeClasses(styles.root, compact ? styles.compact : medium && styles.medium, maximized && styles.maximized)} style={compact || maximized ? undefined : { gridTemplateColumns: `${areas.left}px minmax(0, 1fr) ${areas.right}px` }}>
          <div className={styles.top}>
            <TopBar />
          </div>
          {compact && drawer && <div className={styles.scrim} onClick={() => useEditor.setState({ drawer: null })} aria-hidden />}
          <div className={compact ? mergeClasses(styles.drawer, styles.drawerLeft, drawer === "steps" && styles.drawerOpen) : mergeClasses(styles.area, styles.steps, maximized && styles.gone)} inert={compact && drawer !== "steps" ? true : undefined}>
            <StepsPanel />
            {!compact && (
              <Splitter axis="x" label="Resize the steps area" style={{ right: 0 }} onStart={() => (startAreas.current = useEditor.getState().areas)} onDrag={(d) => setAreas({ left: Math.min(480, Math.max(160, startAreas.current.left + d)) })} onReset={() => setAreas({ left: 230 })} />
            )}
          </div>
          <div className={mergeClasses(styles.area, styles.canvas)}>
            <ViewportHeader />
            <div className={styles.stage}>
              <CanvasView />
              <AgentPanel />
              <AiPanel />
            </div>
          </div>
          <div className={compact ? mergeClasses(styles.drawer, styles.drawerRight, drawer === "inspector" && styles.drawerOpen) : mergeClasses(styles.right, maximized && styles.gone)} inert={compact && drawer !== "inspector" ? true : undefined}>
            {!compact && (
              <Splitter axis="x" label="Resize the right areas" style={{ left: "-4px" }} onStart={() => (startAreas.current = useEditor.getState().areas)} onDrag={(d) => setAreas({ right: Math.min(560, Math.max(240, startAreas.current.right - d)) })} onReset={() => setAreas({ right: 300 })} />
            )}
            <div className={mergeClasses(styles.area, styles.outliner)} style={compact ? undefined : { flex: `0 0 ${areas.outliner}%`, position: "relative" }}>
              <Outliner />
              {!compact && (
                <Splitter
                  axis="y"
                  label="Resize the outliner"
                  style={{ bottom: 0 }}
                  onStart={() => (startAreas.current = useEditor.getState().areas)}
                  onDrag={(d) => {
                    const h = (document.querySelector('[aria-label="Outliner"]')?.parentElement?.parentElement?.clientHeight ?? 600) || 600;
                    setAreas({ outliner: Math.min(75, Math.max(12, startAreas.current.outliner + (d / h) * 100)) });
                  }}
                  onReset={() => setAreas({ outliner: 34 })}
                />
              )}
            </div>
            <div className={mergeClasses(styles.area, styles.inspector)}>
              <Inspector />
            </div>
          </div>
          <div className={mergeClasses(styles.area, styles.play, maximized && styles.gone)}>
            {recording ? (
              <RecordBar />
            ) : takes ? (
              <TakesBar />
            ) : (
              <>
                <PlaybackBar />
                {timelineOpen && <TimelinePanel />}
                <AudioLane />
              </>
            )}
          </div>
          <div className={styles.status}>
            <StatusBar />
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
          <SaveWidgetDialog />
          <BuildDialog />
          <MessageDialog />
          <HistoryDialog />
          <CommandPalette />
          {presenting && <PresentMode />}
        </div>
      )}
    </FluentProvider>
  );
}
