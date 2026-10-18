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
  /** The last message for the user (see notify.ts). */
  notice: import("./notify.js").Notice | null;

  apply(tx: TransactionInput): ReturnType<OperationBus["apply"]>;
  undo(): void;
  redo(): void;
  openScene(scene: Scene): void;
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
    const { selectedStep, selection } = get();
    const stepExists = selectedStep === null || scene.steps.some((s) => s.id === selectedStep);
    set({
      scene,
      timeline,
      version: bus.version,
      selectedStep: stepExists ? selectedStep : null,
      selection: selection.filter((id) => id in scene.elements),
      playhead: Math.min(get().playhead, timeline.totalMs),
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
    exportOpen: false,
    presenting: false,
    paletteOpen: false,

    apply: (tx) => get().bus.apply(tx),
    undo: () => get().bus.undo(),
    redo: () => get().bus.redo(),

    openScene(scene) {
      get().pause();
      get().bus.reset(scene);
      set({ scene, timeline: resolveTimeline(scene), version: get().bus.version, selectedStep: null, selection: [], playhead: 0 });
      get().fitToVideo();
    },

    setView: (view) => set({ view: { ...get().view, ...view } }),
    setViewport: (width, height) => set({ viewport: { width, height } }),

    fitToVideo() {
      const { scene, viewport } = get();
      const cam = scene.settings.camera ?? { x: 0, y: 0, width: scene.settings.video.width, height: scene.settings.video.height };
      const margin = 48;
      const zoom = Math.max(MIN_ZOOM, Math.min((viewport.width - margin * 2) / cam.width, (viewport.height - margin * 2) / cam.height));
      set({ view: { zoom, x: cam.x - (viewport.width / zoom - cam.width) / 2, y: cam.y - (viewport.height / zoom - cam.height) / 2 } });
    },

    zoomAt(factor, cx, cy) {
      const { view } = get();
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
      // Keep the scene point under the cursor at the same screen position.
      const sx = view.x + cx / view.zoom;
      const sy = view.y + cy / view.zoom;
      set({ view: { zoom, x: sx - cx / zoom, y: sy - cy / zoom } });
    },

    setPlayhead: (ms) => set({ playhead: Math.max(0, Math.min(ms, get().timeline.totalMs)) }),

    play() {
      if (get().playing) return;
      const total = get().timeline.totalMs;
      if (total <= 0) return;
      if (get().playhead >= total) set({ playhead: 0 });
      set({ playing: true });
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
      set({ selectedStep: id, playhead: stepEndMs(get().timeline, id) });
    },

    setSelection: (ids) => set({ selection: ids }),
    setTool: (tool) => set({ tool }),
    setEditingText: (id) => set({ editingText: id }),
    setIconPicker: (at) => set({ iconPicker: at }),
  };
});
