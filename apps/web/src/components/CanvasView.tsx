import { evaluateWithLayout } from "@anivo/layout";
import { type Ctx2D, renderFrame } from "@anivo/render";
import { makeStyles, tokens } from "@fluentui/react-components";
import { useEffect, useRef } from "react";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  root: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
    minWidth: 0,
    minHeight: 0,
    touchAction: "none",
  },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" },
});

/** Opacity of elements that are not visible yet, so the user can see and edit them. */
const GHOST = 0.28;

export function CanvasView() {
  const styles = useStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const spaceDown = useRef(false);

  // Size the canvases to the container, in device pixels.
  useEffect(() => {
    const root = rootRef.current!;
    const ro = new ResizeObserver(() => {
      const { width, height } = root.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      for (const c of [sceneRef.current!, overlayRef.current!]) {
        c.width = Math.max(1, Math.round(width * dpr));
        c.height = Math.max(1, Math.round(height * dpr));
      }
      const first = useEditor.getState().viewport.width === 800;
      useEditor.getState().setViewport(width, height);
      if (first) useEditor.getState().fitToVideo();
      draw();
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // Draw on each relevant state change, at most once per animation frame.
  useEffect(() => {
    let pending = 0;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.scene !== prev.scene || s.view !== prev.view || s.playhead !== prev.playhead || s.viewport !== prev.viewport || s.playing !== prev.playing) {
        if (!pending) pending = requestAnimationFrame(() => ((pending = 0), draw()));
      }
    });
    return () => {
      unsub();
      cancelAnimationFrame(pending);
    };
  }, []);

  function draw() {
    const canvas = sceneRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const { scene, view, playhead, playing } = useEditor.getState();
    const ctx = canvas.getContext("2d")!;
    const camera = { x: view.x, y: view.y, width: canvas.width / (view.zoom * (window.devicePixelRatio || 1)), height: canvas.height / (view.zoom * (window.devicePixelRatio || 1)) };
    const { frame, routes } = evaluateWithLayout(scene, playhead);
    renderFrame(ctx as unknown as Ctx2D, scene, frame, routes, { width: canvas.width, height: canvas.height, camera, ghostHidden: playing ? 0 : GHOST });
    drawOverlay(overlay, camera);
  }

  /** Dim the area outside the video camera and outline the camera. */
  function drawOverlay(overlay: HTMLCanvasElement, camera: { x: number; y: number; width: number; height: number }) {
    const { scene } = useEditor.getState();
    const ctx = overlay.getContext("2d")!;
    const sx = overlay.width / camera.width;
    const sy = overlay.height / camera.height;
    const v = scene.settings.camera ?? { x: 0, y: 0, width: scene.settings.video.width, height: scene.settings.video.height };
    const x = (v.x - camera.x) * sx;
    const y = (v.y - camera.y) * sy;
    const w = v.width * sx;
    const h = v.height * sy;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.rect(0, 0, overlay.width, overlay.height);
    ctx.rect(x, y + h, w, -h);
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(140, 170, 210, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    ctx.setLineDash([]);
  }

  // Pan with Space+drag, the middle button, or the hand tool. Zoom with Ctrl/Cmd+wheel or a pinch.
  useEffect(() => {
    const root = rootRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = root.getBoundingClientRect();
      const st = useEditor.getState();
      if (e.ctrlKey || e.metaKey) {
        st.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        st.setView({ x: st.view.x + e.deltaX / st.view.zoom, y: st.view.y + e.deltaY / st.view.zoom });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        spaceDown.current = e.type === "keydown";
        root.style.cursor = spaceDown.current ? "grab" : "";
      }
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      root.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const st = useEditor.getState();
    const pan = e.button === 1 || spaceDown.current || st.tool === "hand";
    if (!pan) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, vx: st.view.x, vy: st.view.y };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
    const move = (ev: PointerEvent) => {
      const z = useEditor.getState().view.zoom;
      useEditor.getState().setView({ x: start.vx - (ev.clientX - start.x) / z, y: start.vy - (ev.clientY - start.y) / z });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.style.cursor = spaceDown.current ? "grab" : "";
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  return (
    <div ref={rootRef} className={styles.root} onPointerDown={onPointerDown} data-testid="canvas-root">
      <canvas ref={sceneRef} className={styles.canvas} aria-label="Scene canvas" />
      <canvas ref={overlayRef} className={styles.canvas} aria-hidden="true" />
    </div>
  );
}
