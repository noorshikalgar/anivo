import { evaluateWithLayout } from "@anivo/layout";
import { type Ctx2D, renderFrame } from "@anivo/render";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    backgroundColor: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    outline: "none",
  },
  canvas: { display: "block" },
  hud: {
    position: "absolute",
    bottom: tokens.spacingVerticalM,
    left: "50%",
    transform: "translateX(-50%)",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    color: "#E6EDF3",
    pointerEvents: "none",
    transition: "opacity 300ms",
  },
  notes: {
    position: "absolute",
    top: tokens.spacingVerticalM,
    left: tokens.spacingHorizontalM,
    maxWidth: "40vw",
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    color: "#E6EDF3",
    whiteSpace: "pre-wrap",
    pointerEvents: "none",
  },
});

/**
 * Present mode (FR-PLAY-01, docs/06 "Present mode behavior"):
 * - The base state shows first. Next plays one step, then waits.
 * - Next during a step jumps to the end of that step.
 * - Previous jumps to the end state of the previous step. It does not play backwards.
 * - Escape exits.
 */
export function PresentMode() {
  const styles = useStyles();
  const scene = useEditor((s) => s.scene);
  const timeline = useEditor((s) => s.timeline);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Index of the current step. -1 is the base state. */
  const [step, setStep] = useState(-1);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState(true);
  const time = useRef(-1);
  const target = useRef(-1);
  const raf = useRef(0);

  const exit = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    useEditor.setState({ presenting: false });
  };

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { frame, routes } = evaluateWithLayout(scene, time.current);
    renderFrame(canvas.getContext("2d") as unknown as Ctx2D, scene, frame, routes, { width: canvas.width, height: canvas.height });
  }

  /** Play from the current time to `to`, then stop. */
  function playTo(to: number) {
    cancelAnimationFrame(raf.current);
    target.current = to;
    let last = performance.now();
    const tick = (now: number) => {
      time.current = Math.min(target.current, time.current + (now - last));
      last = now;
      draw();
      if (time.current < target.current) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  function jump(t: number) {
    cancelAnimationFrame(raf.current);
    time.current = t;
    target.current = t;
    draw();
  }

  function next() {
    const steps = timeline.steps;
    // During a step: jump to its end.
    if (step >= 0 && time.current < target.current) {
      jump(target.current);
      return;
    }
    if (step + 1 >= steps.length) return;
    const s = steps[step + 1]!;
    setStep(step + 1);
    time.current = s.startMs;
    // Play the step and its hold, so flow particles finish their travel.
    playTo(s.holdEndMs);
  }

  function prev() {
    if (step < 0) return;
    const i = step - 1;
    setStep(i);
    jump(i < 0 ? -1 : timeline.steps[i]!.holdEndMs);
  }

  // Size the canvas to the screen with the video aspect ratio.
  useEffect(() => {
    const root = rootRef.current!;
    const resize = () => {
      const v = scene.settings.video;
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.min(root.clientWidth / v.width, root.clientHeight / v.height);
      const c = canvasRef.current!;
      c.style.width = `${Math.floor(v.width * scale)}px`;
      c.style.height = `${Math.floor(v.height * scale)}px`;
      c.width = Math.floor(v.width * scale * dpr);
      c.height = Math.floor(v.height * scale * dpr);
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    root.focus();
    void root.requestFullscreen?.().catch(() => undefined);
    const onFs = () => {
      if (!document.fullscreenElement) useEditor.setState({ presenting: false });
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  // Hide the step counter after 2 seconds with no input.
  useEffect(() => {
    setHud(true);
    const t = setTimeout(() => setHud(false), 2000);
    return () => clearTimeout(t);
  }, [step]);

  const notes = step >= 0 ? scene.steps[step]?.notes : undefined;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      tabIndex={0}
      role="dialog"
      aria-label="Present mode"
      onClick={next}
      onContextMenu={(e) => {
        e.preventDefault();
        prev();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
          e.preventDefault();
          next();
        } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
          e.preventDefault();
          prev();
        } else if (e.key === "Home") {
          setStep(-1);
          jump(-1);
        } else if (e.key.toLowerCase() === "n") setShowNotes((v) => !v);
        else if (e.key === "Escape") exit();
      }}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-label="Presentation" />
      <div className={styles.hud} style={{ opacity: hud ? 1 : 0 }}>
        <Text size={200}>
          {step < 0 ? "Start" : `Step ${step + 1} of ${timeline.steps.length}`} · Click or → for next · ← back · N notes · Esc exit
        </Text>
      </div>
      {showNotes && notes && <div className={styles.notes}>{notes}</div>}
    </div>
  );
}
