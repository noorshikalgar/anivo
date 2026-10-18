import type { FrameState } from "@anivo/engine";
import { type Polyline, evaluateWithLayout } from "@anivo/layout";
import { type Ctx2D, renderFrame } from "@anivo/render";
import type { Point } from "@anivo/schema";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { useEffect, useRef } from "react";
import { insertImage } from "../images.js";
import { withErrors } from "../notify.js";
import {
  type Box,
  HANDLES,
  boundsOf,
  topLevel,
  type Handle,
  elementBounds,
  elementsInRect,
  handlePoints,
  hitTest,
  normalizeRect,
  previewFrame,
  resizeBox,
  snap,
  toScene,
  toScreen,
} from "../editing.js";
import { addElement, commitGeometry, movableIds } from "../commands.js";
import { TextEditor } from "./TextEditor.js";
import { ToolPalette } from "./ToolPalette.js";
import { useEditor } from "../store.js";

type Drag =
  | { kind: "move"; start: Point; ids: string[]; boxes: Map<string, Box>; dx: number; dy: number; moved: boolean }
  | { kind: "resize"; start: Point; id: string; handle: Handle; box: Box; next: Box }
  | { kind: "marquee"; start: Point; end: Point; additive: boolean; base: string[] }
  | { kind: "create"; type: "rectangle" | "ellipse" | "diamond"; start: Point; end: Point }
  | { kind: "arrow"; start: Point; end: Point; from: string | null; to: string | null };

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
  // Crosshair for the draw tools.
  draw: { cursor: "crosshair" },
});

/** Opacity of elements that are not visible yet, so the user can see and edit them. */
const GHOST = 0.28;

export function CanvasView() {
  const styles = useStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const spaceDown = useRef(false);
  const last = useRef<{ frame: FrameState; routes: Map<string, Polyline> } | null>(null);
  const drag = useRef<Drag | null>(null);
  const hover = useRef<string | null>(null);
  const tool = useEditor((s) => s.tool);

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
      if (s.scene !== prev.scene || s.view !== prev.view || s.playhead !== prev.playhead || s.viewport !== prev.viewport || s.playing !== prev.playing || s.selection !== prev.selection || s.selectedStep !== prev.selectedStep || s.imagesVersion !== prev.imagesVersion) {
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
    const { scene, view, playhead, playing, selectedStep } = useEditor.getState();
    // The base state is before step 1. Time 0 already has step 1 actions at progress 0.
    const t = !playing && selectedStep === null && playhead === 0 ? -1 : playhead;
    const ctx = canvas.getContext("2d")!;
    const camera = { x: view.x, y: view.y, width: canvas.width / (view.zoom * (window.devicePixelRatio || 1)), height: canvas.height / (view.zoom * (window.devicePixelRatio || 1)) };
    let result = evaluateWithLayout(scene, t);
    last.current = result;
    const d = drag.current;
    if (d && d.kind === "move" && d.moved) {
      const changes = new Map<string, Partial<Box>>();
      for (const [id, b] of d.boxes) changes.set(id, { x: b.x + d.dx, y: b.y + d.dy });
      result = previewFrame(scene, result.frame, changes);
    } else if (d && d.kind === "resize") {
      result = previewFrame(scene, result.frame, new Map([[d.id, d.next]]));
    }
    renderFrame(ctx as unknown as Ctx2D, scene, result.frame, result.routes, { width: canvas.width, height: canvas.height, camera, ghostHidden: playing ? 0 : GHOST });
    drawOverlay(overlay, camera, result);
  }

  /** Dim the area outside the video camera and outline the camera. */
  function drawOverlay(overlay: HTMLCanvasElement, camera: { x: number; y: number; width: number; height: number }, result: { frame: FrameState; routes: Map<string, Polyline> }) {
    const { scene, selection, view, playing } = useEditor.getState();
    const ctx = overlay.getContext("2d")!;
    const sx = overlay.width / camera.width;
    const sy = overlay.height / camera.height;
    // The video camera at the current time: camera actions move it.
    const v = result.frame.camera;
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
    if (playing) return;

    // Selection, hover, handles, and marquee, in device pixels.
    const dpr = window.devicePixelRatio || 1;
    const accent = "#3F82F0";
    const byId = new Map(result.frame.elements.map((f) => [f.id, f]));
    const screenBox = (b: Box) => {
      const p = toScreen(view, { x: b.x, y: b.y });
      return { x: p.x * dpr, y: p.y * dpr, width: b.width * view.zoom * dpr, height: b.height * view.zoom * dpr };
    };
    const outline = (id: string, width: number, alpha: number) => {
      const bounds = boundsOf(scene, result.frame, result.routes, id);
      if (!bounds) return;
      const b = screenBox(bounds);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width * dpr;
      ctx.strokeRect(b.x - 4 * dpr, b.y - 4 * dpr, b.width + 8 * dpr, b.height + 8 * dpr);
      ctx.globalAlpha = 1;
      return b;
    };
    if (hover.current && !selection.includes(hover.current) && !drag.current) outline(hover.current, 1, 0.6);
    for (const id of selection) outline(id, 1.5, 1);
    const single = selection.length === 1 ? byId.get(selection[0]!) : undefined;
    if (single && single.type !== "connector" && single.type !== "group" && drag.current?.kind !== "move") {
      const b = elementBounds(single, result.routes);
      const pts = handlePoints(b);
      const size = 8 * dpr;
      for (const h of HANDLES) {
        const sp = toScreen(view, pts[h]);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5 * dpr;
        ctx.fillRect(sp.x * dpr - size / 2, sp.y * dpr - size / 2, size, size);
        ctx.strokeRect(sp.x * dpr - size / 2, sp.y * dpr - size / 2, size, size);
      }
    }
    const d = drag.current;
    if (d?.kind === "create") {
      const r = screenBox(normalizeRect(d.start, d.end));
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.beginPath();
      if (d.type === "ellipse") ctx.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
      else if (d.type === "diamond") {
        ctx.moveTo(r.x + r.width / 2, r.y);
        ctx.lineTo(r.x + r.width, r.y + r.height / 2);
        ctx.lineTo(r.x + r.width / 2, r.y + r.height);
        ctx.lineTo(r.x, r.y + r.height / 2);
        ctx.closePath();
      } else ctx.rect(r.x, r.y, r.width, r.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (d?.kind === "arrow") {
      for (const id of [d.from, d.to]) if (id) outline(id, 2, 0.9);
      const a = toScreen(view, d.start);
      const b = toScreen(view, d.end);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(a.x * dpr, a.y * dpr);
      ctx.lineTo(b.x * dpr, b.y * dpr);
      ctx.stroke();
    }
    if (d?.kind === "marquee") {
      const r = screenBox(normalizeRect(d.start, d.end));
      ctx.fillStyle = "rgba(63, 130, 240, 0.12)";
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1 * dpr;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeRect(r.x, r.y, r.width, r.height);
    }
  }

  function currentBox(id: string): Box | undefined {
    return last.current ? boundsOf(useEditor.getState().scene, last.current.frame, last.current.routes, id) : undefined;
  }

  function scenePoint(e: { clientX: number; clientY: number }): Point {
    const rect = rootRef.current!.getBoundingClientRect();
    return toScene(useEditor.getState().view, e.clientX - rect.left, e.clientY - rect.top);
  }

  function handleAt(p: Point): Handle | null {
    const st = useEditor.getState();
    if (st.selection.length !== 1 || !last.current) return null;
    const f = last.current.frame.elements.find((e) => e.id === st.selection[0]);
    if (!f || f.type === "connector") return null;
    const pts = handlePoints(elementBounds(f, last.current.routes));
    const tol = 7 / st.view.zoom;
    for (const h of HANDLES) if (Math.abs(pts[h].x - p.x) <= tol && Math.abs(pts[h].y - p.y) <= tol) return h;
    return null;
  }

  function requestDraw() {
    requestAnimationFrame(draw);
  }

  function onSelectPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const st = useEditor.getState();
    if (st.playing) st.pause();
    const p = scenePoint(e);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const h = handleAt(p);
    if (h) {
      const box = currentBox(st.selection[0]!)!;
      drag.current = { kind: "resize", start: p, id: st.selection[0]!, handle: h, box, next: box };
    } else {
      const leaf = last.current ? hitTest(last.current.frame, last.current.routes, p, 4 / st.view.zoom, true) : null;
      // A click on an element in a group selects the group. Alt selects the element itself.
      const hit = leaf && !e.altKey ? topLevel(st.scene, leaf) : leaf;
      if (hit) {
        let sel = st.selection;
        if (e.shiftKey) sel = sel.includes(hit) ? sel.filter((x) => x !== hit) : [...sel, hit];
        else if (!sel.includes(hit)) sel = [hit];
        st.setSelection(sel);
        const boxes = new Map<string, Box>();
        for (const id of movableIds(sel)) {
          const b = currentBox(id);
          if (b) boxes.set(id, b);
        }
        drag.current = { kind: "move", start: p, ids: sel, boxes, dx: 0, dy: 0, moved: false };
      } else {
        drag.current = { kind: "marquee", start: p, end: p, additive: e.shiftKey, base: e.shiftKey ? st.selection : [] };
        if (!e.shiftKey) st.setSelection([]);
      }
    }

    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const q = scenePoint(ev);
      const grid = !ev.altKey;
      if (d.kind === "move") {
        const first = d.boxes.values().next().value;
        let dx = q.x - d.start.x;
        let dy = q.y - d.start.y;
        if (first) {
          dx = snap(first.x + dx, grid) - first.x;
          dy = snap(first.y + dy, grid) - first.y;
        }
        if (ev.shiftKey) {
          // Shift keeps the move on one axis.
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        d.moved = d.moved || Math.hypot(q.x - d.start.x, q.y - d.start.y) * useEditor.getState().view.zoom > 3;
        d.dx = dx;
        d.dy = dy;
      } else if (d.kind === "resize") {
        const r = resizeBox(d.box, d.handle, q.x - d.start.x, q.y - d.start.y, ev.shiftKey);
        d.next = { x: snap(r.x, grid), y: snap(r.y, grid), width: Math.max(8, snap(r.width, grid)), height: Math.max(8, snap(r.height, grid)) };
      } else if (d.kind === "marquee") {
        d.end = q;
        if (last.current) {
          const sc = useEditor.getState().scene;
          const inside = [...new Set(elementsInRect(last.current.frame, last.current.routes, normalizeRect(d.start, d.end), true).map((id) => topLevel(sc, id)))];
          useEditor.getState().setSelection([...new Set([...d.base, ...inside])]);
        }
      }
      requestDraw();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      const d = drag.current;
      drag.current = null;
      if (d?.kind === "move" && d.moved) {
        const changes = new Map<string, Box>();
        for (const [id, b] of d.boxes) changes.set(id, { ...b, x: b.x + d.dx, y: b.y + d.dy });
        commitGeometry(changes, d.ids.length > 1 ? "Move elements" : "Move element");
      } else if (d?.kind === "resize") {
        commitGeometry(new Map([[d.id, d.next]]), "Resize element");
      }
      requestDraw();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  /** Element (not a connector) at a scene point, for arrow bindings. */
  function shapeAt(p: Point): string | null {
    const st = useEditor.getState();
    if (!last.current) return null;
    const hit = hitTest(last.current.frame, last.current.routes, p, 2 / st.view.zoom, true);
    return hit && st.scene.elements[hit]?.type !== "connector" ? hit : null;
  }

  function onDrawPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const st = useEditor.getState();
    if (st.playing) st.pause();
    const p = scenePoint(e);
    const grid = !e.altKey;
    const start = { x: snap(p.x, grid), y: snap(p.y, grid) };
    if (st.tool === "text") {
      const id = addElement("text", { content: { text: "" }, x: start.x, y: start.y - 30, width: 360, height: 60 }, "Add text");
      if (id) st.setEditingText(id);
      st.setTool("select");
      return;
    }
    if (st.tool === "icon") {
      st.setIconPicker(start);
      return;
    }
    if (st.tool === "code") {
      addElement("code", { code: "function hello(name) {\n  return `Hello, ${name}`;\n}", language: "js", x: start.x, y: start.y, width: 560, height: 168 }, "Add code block");
      st.setTool("select");
      return;
    }
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    if (st.tool === "arrow") drag.current = { kind: "arrow", start: p, end: p, from: shapeAt(p), to: null };
    else drag.current = { kind: "create", type: st.tool as "rectangle" | "ellipse" | "diamond", start, end: start };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const q = scenePoint(ev);
      if (d.kind === "create") {
        let end = { x: snap(q.x, !ev.altKey), y: snap(q.y, !ev.altKey) };
        if (ev.shiftKey) {
          const size = Math.max(Math.abs(end.x - d.start.x), Math.abs(end.y - d.start.y));
          end = { x: d.start.x + Math.sign(end.x - d.start.x || 1) * size, y: d.start.y + Math.sign(end.y - d.start.y || 1) * size };
        }
        d.end = end;
      } else if (d.kind === "arrow") {
        d.end = q;
        const to = shapeAt(q);
        d.to = to !== d.from ? to : null;
      }
      requestDraw();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      const d = drag.current;
      drag.current = null;
      if (d?.kind === "create") {
        let r = normalizeRect(d.start, d.end);
        // A click with no drag makes a shape with the default size.
        if (r.width < 8 || r.height < 8) r = { x: d.start.x - 100, y: d.start.y - 50, width: 200, height: 100 };
        addElement(d.type, { ...r }, `Add ${d.type}`);
        useEditor.getState().setTool("select");
      } else if (d?.kind === "arrow") {
        const len = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);
        if (len * useEditor.getState().view.zoom > 6) {
          const endOf = (id: string | null, pt: Point) => (id ? { kind: "bound", elementId: id } : { kind: "free", x: Math.round(pt.x), y: Math.round(pt.y) });
          addElement("connector", { start: endOf(d.from, d.start), end: endOf(d.to, d.end), endHead: "arrow" }, "Add arrow");
        }
        useEditor.getState().setTool("select");
      }
      requestDraw();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const st = useEditor.getState();
    if (st.tool !== "select" || !last.current) return;
    const p = scenePoint(e);
    const hit = hitTest(last.current.frame, last.current.routes, p, 4 / st.view.zoom, true);
    if (hit && st.scene.elements[hit]?.type !== "connector") {
      st.setSelection([hit]);
      st.setEditingText(hit);
    } else if (!hit) {
      // Double-click on empty canvas adds a text element.
      const id = addElement("text", { content: { text: "" }, x: Math.round(p.x - 180), y: Math.round(p.y - 30), width: 360, height: 60 }, "Add text");
      if (id) st.setEditingText(id);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current || useEditor.getState().tool !== "select") return;
    const p = scenePoint(e);
    const h = handleAt(p);
    const cursor: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
    const st = useEditor.getState();
    const leaf = !h && last.current ? hitTest(last.current.frame, last.current.routes, p, 4 / st.view.zoom, true) : null;
    const hit = leaf ? topLevel(st.scene, leaf) : null;
    if (!spaceDown.current) e.currentTarget.style.cursor = h ? cursor[h] : hit ? "move" : "";
    if (hit !== hover.current) {
      hover.current = hit;
      requestDraw();
    }
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
    // The tool palette and the text editor are inside the canvas root. Their own clicks must work.
    if (!(e.target instanceof HTMLCanvasElement)) return;
    const st = useEditor.getState();
    const pan = e.button === 1 || spaceDown.current || st.tool === "hand";
    if (!pan) {
      if (e.button === 0 && st.tool === "select") onSelectPointerDown(e);
      else if (e.button === 0) onDrawPointerDown(e);
      return;
    }
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
    <div ref={rootRef} className={mergeClasses(styles.root, tool !== "select" && tool !== "hand" && styles.draw)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onDoubleClick={onDoubleClick}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file")) e.preventDefault();
      }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|svg)$/i.test(f.name));
        if (files.length === 0) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const { view } = useEditor.getState();
        const at = { x: view.x + (e.clientX - r.left) / view.zoom, y: view.y + (e.clientY - r.top) / view.zoom };
        void withErrors(async () => {
          for (const [i, f] of files.entries()) await insertImage(new Uint8Array(await f.arrayBuffer()), f.name, f.type, { x: at.x + i * 24, y: at.y + i * 24 });
        });
      }}
      data-testid="canvas-root"
      data-tool={tool}
    >
      <canvas ref={sceneRef} className={styles.canvas} aria-label="Scene canvas" />
      <canvas ref={overlayRef} className={styles.canvas} aria-hidden="true" />
      <ToolPalette />
      <TextEditor />
    </div>
  );
}
