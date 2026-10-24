/**
 * Scrub preview (docs/22 D1): a small frame of the time under the pointer,
 * above the timeline ruler. You see a moment without moving the playhead.
 */
import { type Ctx2D, renderScene } from "@anivo/render";
import { useEffect, useRef } from "react";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";

const W = 224;

export function ScrubPreview({ ms, clientX, top }: { ms: number; clientX: number; top: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scene = useEditor((st) => st.scene);
  const { width, height } = scene.settings.video;
  const h = Math.round((W * height) / width);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    // One frame for each animation frame at most, while the pointer moves.
    const raf = requestAnimationFrame(() => {
      cv.width = W * 2;
      cv.height = h * 2;
      renderScene(cv.getContext("2d") as unknown as Ctx2D, scene, ms, { width: cv.width, height: cv.height });
    });
    return () => cancelAnimationFrame(raf);
  }, [scene, ms, h]);
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, clientX - W / 2));
  return (
    <div
      aria-hidden
      data-scrub-preview
      style={{ position: "fixed", left, top: top - h - 30, width: W, zIndex: 30, pointerEvents: "none", borderRadius: 6, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,.45)", border: "1px solid var(--ui-line)", background: "var(--ui-menu)" }}
    >
      <canvas ref={ref} style={{ display: "block", width: W, height: h }} />
      <div style={{ fontSize: 11, lineHeight: "20px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{formatTime(ms)}</div>
    </div>
  );
}
