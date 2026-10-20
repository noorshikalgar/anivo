import { type Timeline, resolveTimeline } from "@anivo/engine";
import { OperationBus, type TransactionInput } from "@anivo/ops";
import { type Scene, loadScene } from "@anivo/schema";
import { create } from "zustand";

export type Tool = "select" | "hand" | "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "icon" | "code";

export interface View {
  /** Scene coordinate at the top-left corner of the canvas. */
  x: number;
  y: number;
  /** CSS pixels for each scene pixel. */
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;

interface EditorState {
  bus: OperationBus;
  scene: Scene;
  timeline: Timeline;
  /** Increases on each scene change. */
  version: number;
  view: View;
  /** Size of the canvas element in CSS pixels. */
  viewport: { width: number; height: number };
  playhead: number;
  playing: boolean;
  /** `null` means the base state, before step 1. */
  selectedStep: string | null;
  selection: string[];
  tool: Tool;
  /** ID of the element whose text is in the inline editor. */
  editingText: string | null;
  /** Scene position for a new icon while the icon picker is open. */
  iconPicker: { x: number; y: number } | null;
  /** Name of the open file, or null for a new scene. */
  fileName: string | null;
  /** True if the scene changed after the last save. */
  dirty: boolean;
  /** True while the command palette is open. */
  paletteOpen: boolean;
  /** True in present mode. */
  presenting: boolean;
  /** True while the export dialog is open. */
  exportOpen: boolean;
  /** The voiceover record, while it runs (see record.ts). */
  recording: import("./record.js").RecordingState | null;
  /** Grid and snap settings of the viewport (kept in this browser). */
  layout: LayoutPrefs;
  /** Sizes of the editor areas in px (kept in this browser). */
  areas: AreaSizes;
  /** Elements that the canvas marks: the targets of the active action in the Actions tab. */
  targetHighlight: string[];
  /** The tab of the properties editor. */
  propTab: "scene" | "step" | "actions" | "element";
  /** True while the "save as widget" dialog is open. */
  saveWidgetOpen: boolean;
  /** The viewport uses the full window (Ctrl+Space). */
  maximized: boolean;
  /** Show the elements that are hidden at the current time, faint (the viewport overlay). */
  showGhosts: boolean;
  /** True while the playhead stays at the end of the selected step (until the user moves it). */
  pinStepEnd: boolean;
  /** The active action of the selected step (properties and step tree), or null. */
  activeAction: string | null;
  /** True while the view fits the video: a change of the window size fits it again. */
  autoFit: boolean;
  /** Small windows: the panel that shows over the canvas (a drawer), or null. */
  drawer: "steps" | "inspector" | null;
  /** The home screen (the scene library) or the editor. */
  screen: "home" | "editor";
  /** The library entry of the open scene, or null (not saved to the library). */
  libraryId: string | null;
  /** Changes when the library changes, so the home screen reads it again. */
  libraryVersion: number;
  /** The step-by-step voice record (takes), or null. */
  takes: import("./takes.js").TakesState | null;
  /** True while the script dialog is open. */
  scriptOpen: boolean;
  /** Increases when a new image is decoded, so the canvas draws again. */
  imagesVersion: number;
  /** True while the timeline panel shows. */
  timelineOpen: boolean;
  /** Elements that the AI panel changed last (for the canvas outline). */
  aiActivity: { ids: string[]; at: number } | null;
  /** True while the text-to-speech dialog is open. */
  ttsOpen: boolean;
  /** True while the share dialog is open. */
  shareOpen: boolean;
  /** True while the shortcut help shows. */
  helpOpen: boolean;
  /** True while the history shows. */
  historyOpen: boolean;
  /** True while the AI panel shows. */
  aiOpen: boolean;
  /** True while the connect agent dialog is open. */
  connectOpen: boolean;
  /** The connected agent (bridge), or null. */
  agent: import("./agent.js").AgentState | null;
  /** True while the first-run tour shows. */
  tourOpen: boolean;
  /** True while the theme editor is open. */
  themeEditorOpen: boolean;
  /** True while the templates gallery is open. */
  galleryOpen: boolean;
  /** True while the align dialog is open. */
  alignOpen: boolean;
  /** Bytes of the scene assets (audio files), by asset ID. The scene has only the references. */
  assets: Map<string, Uint8Array>;
  /** The last message for the user (see notify.ts). */
  notice: import("./notify.js").Notice | null;

  apply(tx: TransactionInput): ReturnType<OperationBus["apply"]>;
  undo(): void;
  redo(): void;
  openScene(scene: Scene, assets?: Map<string, Uint8Array>): void;
  setView(view: Partial<View>): void;
  setViewport(width: number, height: number): void;
  fitToVideo(): void;
  zoomAt(factor: number, cx: number, cy: number): void;
  setPlayhead(ms: number): void;
  play(): void;
  pause(): void;
  selectStep(id: string | null): void;
  setSelection(ids: string[]): void;
  setTool(tool: Tool): void;
  setEditingText(id: string | null): void;
  setIconPicker(at: { x: number; y: number } | null): void;
}

export interface LayoutPrefs {
  showGrid: boolean;
  snapGrid: boolean;
  snapObjects: boolean;
  gridSize: number;
}
export interface AreaSizes {
  /** Width of the steps area. */
  left: number;
  /** Width of the right column (outliner and properties). */
  right: number;
  /** Height of the outliner, in percent of the right column. */
  outliner: number;
  /** Height of the timeline tracks. */
  timeline: number;
}

function readPref<T extends object>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<T>) };
  } catch {
    return fallback;
  }
}

/** Save a preference in this browser. */
export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked: the preference lasts for this session only.
  }
}

/** Change the grid and snap settings. */
export function setLayout(p: Partial<LayoutPrefs>): void {
  const layout = { ...useEditor.getState().layout, ...p };
  useEditor.setState({ layout });
  writePref("anivo.layout", layout);
}

/** Change the area sizes. */
export function setAreas(p: Partial<AreaSizes>): void {
  const areas = { ...useEditor.getState().areas, ...p };
  useEditor.setState({ areas });
  writePref("anivo.areas", areas);
}

function emptyScene(): Scene {
  const r = loadScene({ schemaVersion: 1, meta: { title: "Untitled" } });
  if (!r.ok) throw new Error("The empty scene is not valid.");
  return r.scene;
}

/** End time of a step's content, or 0 for the base state. */
export function stepEndMs(timeline: Timeline, stepId: string | null): number {
  if (stepId === null) return 0;
  return timeline.steps.find((s) => s.id === stepId)?.endMs ?? 0;
}

let rafId = 0;

export const useEditor = create<EditorState>((set, get) => {
  const bus = new OperationBus(emptyScene());
  bus.subscribe((scene) => {
    const timeline = resolveTimeline(scene);
    const { selectedStep, selection, pinStepEnd, playing } = get();
    const stepExists = selectedStep === null || scene.steps.some((s) => s.id === selectedStep);
    // With a step selected, the canvas shows the end of the step. A change can make the step
    // longer (a new action, a morph): the playhead follows the new end, so the change shows at once.
    const pinned = stepExists && selectedStep !== null && pinStepEnd && !playing;
    set({
      scene,
      timeline,
      version: bus.version,
      selectedStep: stepExists ? selectedStep : null,
      selection: selection.filter((id) => id in scene.elements),
      playhead: pinned ? stepEndMs(timeline, selectedStep) : Math.min(get().playhead, timeline.totalMs),
    });
  });

  return {
    bus,
    scene: bus.scene,
    timeline: resolveTimeline(bus.scene),
    version: 0,
    view: { x: -100, y: -100, zoom: 0.5 },
    viewport: { width: 800, height: 600 },
    playhead: 0,
    playing: false,
    selectedStep: null,
    selection: [],
    tool: "select",
    editingText: null,
    iconPicker: null,
    fileName: null,
    dirty: false,
    notice: null,
    assets: new Map(),
    exportOpen: false,
    scriptOpen: false,
    alignOpen: false,
    galleryOpen: false,
    themeEditorOpen: false,
    tourOpen: false,
    agent: null,
    connectOpen: false,
    aiActivity: null,
    aiOpen: false,
    helpOpen: false,
    shareOpen: false,
    ttsOpen: false,
    historyOpen: false,
    timelineOpen: false,
    imagesVersion: 0,
    recording: null,
    takes: null,
    screen: "home",
    autoFit: true,
    activeAction: null,
    pinStepEnd: false,
    showGhosts: true,
    maximized: false,
    saveWidgetOpen: false,
    targetHighlight: [],
    layout: readPref("anivo.layout", { showGrid: false, snapGrid: true, snapObjects: true, gridSize: 8 }),
    areas: readPref("anivo.areas", { left: 230, right: 300, outliner: 34, timeline: 200 }),
    propTab: "scene",
    drawer: null,
    libraryId: null,
    libraryVersion: 0,
    presenting: false,
    paletteOpen: false,

    apply: (tx) => get().bus.apply(tx),
    undo: () => get().bus.undo(),
    redo: () => get().bus.redo(),

    openScene(scene, assets = new Map()) {
      get().pause();
      get().bus.reset(scene);
      set({ assets, scene, timeline: resolveTimeline(scene), version: get().bus.version, selectedStep: null, selection: [], playhead: 0, screen: "editor", libraryId: null });
      get().fitToVideo();
    },

    setView: (view) => set({ view: { ...get().view, ...view }, autoFit: false }),
    setViewport: (width, height) => {
      set({ viewport: { width, height } });
      // Until the user pans or zooms, the video stays fitted when the window size changes.
      if (get().autoFit) get().fitToVideo();
    },

    fitToVideo() {
      const { scene, viewport } = get();
      const cam = scene.settings.camera ?? { x: 0, y: 0, width: scene.settings.video.width, height: scene.settings.video.height };
      const margin = Math.min(48, Math.max(12, Math.min(viewport.width, viewport.height) * 0.05));
      const zoom = Math.max(MIN_ZOOM, Math.min((viewport.width - margin * 2) / cam.width, (viewport.height - margin * 2) / cam.height));
      set({ autoFit: true, view: { zoom, x: cam.x - (viewport.width / zoom - cam.width) / 2, y: cam.y - (viewport.height / zoom - cam.height) / 2 } });
    },

    zoomAt(factor, cx, cy) {
      const { view } = get();
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
      // Keep the scene point under the cursor at the same screen position.
      const sx = view.x + cx / view.zoom;
      const sy = view.y + cy / view.zoom;
      set({ autoFit: false, view: { zoom, x: sx - cx / zoom, y: sy - cy / zoom } });
    },

    setPlayhead: (ms) => set({ playhead: Math.max(0, Math.min(ms, get().timeline.totalMs)), pinStepEnd: false }),

    play() {
      if (get().playing) return;
      const total = get().timeline.totalMs;
      if (total <= 0) return;
      if (get().playhead >= total) set({ playhead: 0 });
      set({ playing: true, pinStepEnd: false });
      let last = performance.now();
      const tick = (now: number) => {
        if (!get().playing) return;
        const next = get().playhead + (now - last);
        last = now;
        if (next >= get().timeline.totalMs) {
          set({ playhead: get().timeline.totalMs, playing: false });
          return;
        }
        set({ playhead: next });
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    },

    pause() {
      cancelAnimationFrame(rafId);
      set({ playing: false });
    },

    selectStep(id) {
      get().pause();
      set({ selectedStep: id, playhead: stepEndMs(get().timeline, id), pinStepEnd: true });
    },

    setSelection: (ids) => set({ selection: ids }),
    setTool: (tool) => set({ tool }),
    setEditingText: (id) => set({ editingText: id }),
    setIconPicker: (at) => set({ iconPicker: at }),
  };
});
