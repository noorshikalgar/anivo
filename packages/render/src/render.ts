import type { ElementFrame, FrameState, Particle } from "@anivo/engine";
import { type Polyline, evaluateWithLayout, frameBox, pointAt, slice } from "@anivo/layout";
import type { ConnectorElement, Element, Point, Scene, SceneStyle } from "@anivo/schema";
import { type Rgba, toCss, withAlpha } from "./color.js";
import type { Ctx2D } from "./ctx.js";
import { type Box, type OutlineKind, cleanOutline, sketchOutline } from "./outline.js";
import { type Theme, getTheme, resolveColor, resolveToken } from "./theme.js";

export interface RenderOptions {
  /** Output size in device pixels. */
  width: number;
  height: number;
  /** Override the scene style. */
  style?: SceneStyle;
  /** Override the scene theme. */
  theme?: string;
}

interface DrawContext {
  ctx: Ctx2D;
  scene: Scene;
  theme: Theme;
  style: SceneStyle;
  routes: Map<string, Polyline>;
}

const OUTLINE_KINDS = new Set<string>(["rectangle", "ellipse", "diamond", "line"]);

function strokePolyline(ctx: Ctx2D, points: Point[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.stroke();
}

function fillPolyline(ctx: Ctx2D, points: Point[]): void {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.closePath();
  ctx.fill();
}

function dashFor(el: Element, width: number): number[] {
  const s = el.style.strokeStyle;
  if (s === "dashed") return [width * 4, width * 3];
  if (s === "dotted") return [width * 0.5, width * 2.5];
  return [];
}

/** Draw the first `progress` of a stroke made of polylines in sequence. */
function strokeProgressive(ctx: Ctx2D, strokes: Polyline[], total: number, progress: number): void {
  let remaining = total * progress;
  for (const line of strokes) {
    if (remaining <= 0) break;
    strokePolyline(ctx, remaining >= line.length ? line.points : slice(line, remaining));
    remaining -= line.length;
  }
}

function fontFor(dc: DrawContext, f: ElementFrame, el: Element): string {
  const size = f.fontSize ?? el.style.fontSize ?? dc.theme.defaults.fontSize;
  const weight = el.style.fontWeight ?? 500;
  const family = el.style.fontFamily ?? (dc.style === "sketch" ? dc.theme.fonts.sketch : dc.theme.fonts.clean);
  return `${weight} ${size}px "${family}"`;
}

function wrapText(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(next).width > maxWidth) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function drawText(dc: DrawContext, f: ElementFrame, el: Element, text: string, box: Box, color: Rgba, alpha: number, reveal: number): void {
  if (!text || alpha <= 0 || color.a <= 0) return;
  const { ctx } = dc;
  ctx.font = fontFor(dc, f, el);
  const size = f.fontSize ?? el.style.fontSize ?? dc.theme.defaults.fontSize;
  const lineHeight = size * 1.25;
  const lines = wrapText(ctx, text, Math.max(10, box.width - 24));
  const align = el.style.textAlign ?? "center";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = toCss(withAlpha(color, alpha));
  const total = text.length;
  let shown = reveal >= 1 ? total : Math.floor(total * reveal);
  const x = align === "left" ? box.x + 12 : align === "right" ? box.x + box.width - 12 : box.x + box.width / 2;
  const y0 = box.y + box.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    if (shown <= 0) return;
    const part = line.slice(0, shown);
    shown -= line.length + 1;
    ctx.fillText(part, x, y0 + i * lineHeight);
  });
}

function drawLabel(dc: DrawContext, f: ElementFrame, el: Element, box: Box, alpha: number): void {
  const color = resolveColor(dc.theme, f.textColor, "textColor", el.type);
  if (f.labelFrom !== undefined && f.labelMix !== undefined) {
    // Crossfade: old text fades out in the first half, new text fades in in the second half.
    drawText(dc, f, el, f.labelFrom, box, color, alpha * Math.max(0, 1 - f.labelMix * 2), 1);
    drawText(dc, f, el, f.label ?? "", box, color, alpha * Math.max(0, f.labelMix * 2 - 1), f.textReveal);
    return;
  }
  drawText(dc, f, el, f.label ?? "", box, color, alpha, f.textReveal);
}

/** Box in local coordinates (after the element transform puts the center at 0,0). */
function localBox(f: ElementFrame): Box {
  return { x: -f.width / 2, y: -f.height / 2, width: f.width, height: f.height };
}

function applyWipeClip(ctx: Ctx2D, f: ElementFrame, b: Box): void {
  if (!f.wipe) return;
  const { direction, p } = f.wipe;
  const pad = 20;
  const w = b.width + pad * 2;
  const h = b.height + pad * 2;
  const x = b.x - pad;
  const y = b.y - pad;
  ctx.beginPath();
  if (direction === "right") ctx.rect(x, y, w * p, h);
  else if (direction === "left") ctx.rect(x + w * (1 - p), y, w * p, h);
  else if (direction === "down") ctx.rect(x, y, w, h * p);
  else ctx.rect(x, y + h * (1 - p), w, h * p);
  ctx.clip();
}

function drawShape(dc: DrawContext, f: ElementFrame, el: Element): void {
  const { ctx, theme } = dc;
  const kind = el.type as OutlineKind;
  const b = localBox(f);
  const radius = f.cornerRadius ?? el.style.cornerRadius ?? theme.defaults.cornerRadius;
  const strokeWidth = f.strokeWidth ?? el.style.strokeWidth ?? theme.defaults.strokeWidth;
  const fill = resolveColor(theme, f.fill, "fill", el.type);
  const stroke = resolveColor(theme, f.stroke, "stroke", el.type);
  const clean = cleanOutline(kind, b, radius);

  if (f.highlight > 0) {
    const hc = resolveToken(theme, f.highlightColor ?? "warning-soft", "fill", el.type);
    ctx.fillStyle = toCss(withAlpha(hc, f.highlight));
    fillPolyline(ctx, cleanOutline(kind === "line" ? "rectangle" : kind, { x: b.x - 14, y: b.y - 14, width: b.width + 28, height: b.height + 28 }, radius + 14).points);
  }

  if (kind !== "line" && fill.a > 0 && f.fillProgress > 0) {
    ctx.fillStyle = toCss(withAlpha(fill, f.fillProgress));
    fillPolyline(ctx, clean.points);
  }
  if (f.flash > 0 && kind !== "line") {
    const fc = resolveToken(theme, f.flashColor ?? "warning", "fill", el.type);
    ctx.fillStyle = toCss(withAlpha(fc, f.flash * 0.6));
    fillPolyline(ctx, clean.points);
  }

  if (stroke.a > 0 && strokeWidth > 0 && f.strokeProgress > 0) {
    ctx.strokeStyle = toCss(stroke);
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dashFor(el, strokeWidth));
    if (dc.style === "sketch") {
      const roughness = el.style.roughness ?? 1;
      const sk = sketchOutline(`${el.id}|${kind}|${Math.round(b.width)}x${Math.round(b.height)}`, { kind, box: b }, el.seed, roughness, strokeWidth);
      strokeProgressive(ctx, sk.strokes, sk.totalLength, f.strokeProgress);
    } else {
      strokeProgressive(ctx, [clean], clean.length, f.strokeProgress);
    }
    ctx.setLineDash([]);
  }

  if (f.glow > 0) {
    const gc = resolveToken(theme, f.glowColor ?? "accent", "stroke", el.type);
    const g = cleanOutline(kind === "line" ? "rectangle" : kind, { x: b.x - 8, y: b.y - 8, width: b.width + 16, height: b.height + 16 }, radius + 8);
    ctx.strokeStyle = toCss(withAlpha(gc, f.glow * 0.8));
    ctx.lineWidth = 6;
    strokePolyline(ctx, g.points);
  }

  if (f.label) drawLabel(dc, f, el, b, f.fillProgress);
}

function drawIcon(dc: DrawContext, f: ElementFrame, el: Element): void {
  // Phase 0 placeholder: a rounded square with the label below it. Lucide icons come in a later task.
  const { ctx, theme } = dc;
  const b = localBox(f);
  const stroke = resolveColor(theme, f.stroke ?? "accent", "stroke", el.type);
  const clean = cleanOutline("rectangle", b, Math.min(b.width, b.height) * 0.25);
  ctx.strokeStyle = toCss(stroke);
  ctx.lineWidth = 4;
  ctx.setLineDash([]);
  strokeProgressive(ctx, [clean], clean.length, f.strokeProgress);
  if (f.label) {
    const labelBox = { x: b.x - 60, y: b.y + b.height + 4, width: b.width + 120, height: 48 };
    drawLabel(dc, f, el, labelBox, f.fillProgress);
  }
}

function drawStandaloneText(dc: DrawContext, f: ElementFrame, el: Element): void {
  drawLabel(dc, f, el, localBox(f), 1);
}

function drawArrowHead(ctx: Ctx2D, tip: Point, dir: Point, size: number, kind: string, color: string): void {
  if (kind === "none") return;
  const bx = -dir.x;
  const by = -dir.y;
  const px = -dir.y;
  const py = dir.x;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (kind === "dot") {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "bar") {
    strokePolyline(ctx, [
      { x: tip.x + px * size * 0.5, y: tip.y + py * size * 0.5 },
      { x: tip.x - px * size * 0.5, y: tip.y - py * size * 0.5 },
    ]);
    return;
  }
  const left = { x: tip.x + bx * size + px * size * 0.5, y: tip.y + by * size + py * size * 0.5 };
  const right = { x: tip.x + bx * size - px * size * 0.5, y: tip.y + by * size - py * size * 0.5 };
  if (kind === "triangle") {
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fill();
    return;
  }
  strokePolyline(ctx, [left, tip, right]);
}

function drawConnector(dc: DrawContext, f: ElementFrame, el: ConnectorElement): void {
  const { ctx, theme } = dc;
  const route = dc.routes.get(el.id);
  if (!route || route.length === 0 || f.strokeProgress <= 0) return;
  const stroke = resolveColor(theme, f.stroke, "stroke", el.type);
  const strokeWidth = f.strokeWidth ?? el.style.strokeWidth ?? theme.defaults.strokeWidth;
  const css = toCss(stroke);
  ctx.strokeStyle = css;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dashFor(el, strokeWidth));
  if (dc.style === "sketch") {
    const key = `${el.id}|${route.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(";")}`;
    const sk = sketchOutline(key, { points: route.points }, el.seed, el.style.roughness ?? 1, strokeWidth);
    strokeProgressive(ctx, sk.strokes, sk.totalLength, f.strokeProgress);
  } else {
    strokeProgressive(ctx, [route], route.length, f.strokeProgress);
  }
  ctx.setLineDash([]);
  // The arrowhead moves with the tip of the line during draw-on.
  const headSize = 10 + strokeWidth * 3;
  const tip = pointAt(route, route.length * f.strokeProgress);
  drawArrowHead(ctx, tip.point, tip.dir, headSize, el.endHead, css);
  if (el.startHead !== "none") {
    const start = pointAt(route, 0);
    drawArrowHead(ctx, start.point, { x: -start.dir.x, y: -start.dir.y }, headSize, el.startHead, css);
  }
  if (f.label) {
    const mid = pointAt(route, route.length / 2).point;
    drawLabel(dc, f, el, { x: mid.x - 150, y: mid.y - 40, width: 300, height: 36 }, f.strokeProgress >= 1 ? 1 : 0);
  }
}

function drawParticles(dc: DrawContext, particles: Particle[]): void {
  const { ctx, theme } = dc;
  for (const p of particles) {
    const route = dc.routes.get(p.connectorId);
    if (!route) continue;
    const d = p.reverse ? route.length - p.distance : p.distance;
    const { point, dir } = pointAt(route, d);
    ctx.fillStyle = toCss(resolveToken(theme, p.color, "fill", "connector"));
    const r = p.size / 2;
    ctx.beginPath();
    if (p.shape === "square") ctx.rect(point.x - r, point.y - r, p.size, p.size);
    else if (p.shape === "pill") {
      ctx.moveTo(point.x - dir.x * r * 2, point.y - dir.y * r * 2);
      ctx.lineTo(point.x + dir.x * r * 2, point.y + dir.y * r * 2);
      ctx.lineWidth = p.size;
      ctx.lineCap = "round";
      ctx.strokeStyle = ctx.fillStyle;
      ctx.stroke();
      continue;
    } else ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBackground(dc: DrawContext, frame: FrameState, opts: RenderOptions): void {
  const { ctx, theme, scene } = dc;
  const bg = scene.settings.background;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, opts.width, opts.height);
  if (bg.kind === "transparent") return;
  ctx.fillStyle = toCss(resolveToken(theme, bg.color ?? "background", "fill", "rectangle"));
  ctx.fillRect(0, 0, opts.width, opts.height);
  if (bg.kind === "grid" || bg.kind === "dots") {
    const cam = frame.camera;
    const sx = opts.width / cam.width;
    const step = 40;
    const grid = toCss(resolveToken(theme, "grid", "stroke", "rectangle"));
    ctx.setTransform(sx, 0, 0, opts.height / cam.height, -cam.x * sx, -cam.y * (opts.height / cam.height));
    ctx.strokeStyle = grid;
    ctx.fillStyle = grid;
    ctx.lineWidth = 1;
    const x0 = Math.floor(cam.x / step) * step;
    const y0 = Math.floor(cam.y / step) * step;
    for (let x = x0; x <= cam.x + cam.width; x += step) {
      if (bg.kind === "grid") strokePolyline(ctx, [{ x, y: cam.y }, { x, y: cam.y + cam.height }]);
      else for (let y = y0; y <= cam.y + cam.height; y += step) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    if (bg.kind === "grid") for (let y = y0; y <= cam.y + cam.height; y += step) strokePolyline(ctx, [{ x: cam.x, y }, { x: cam.x + cam.width, y }]);
  }
}

/** Draw one frame state. The renderer does not change the scene (docs/07). */
export function renderFrame(ctx: Ctx2D, scene: Scene, frame: FrameState, routes: Map<string, Polyline>, opts: RenderOptions): void {
  const dc: DrawContext = {
    ctx,
    scene,
    theme: getTheme(opts.theme ?? scene.settings.theme),
    style: opts.style ?? scene.settings.style,
    routes,
  };
  drawBackground(dc, frame, opts);
  const cam = frame.camera;
  const sx = opts.width / cam.width;
  const sy = opts.height / cam.height;

  for (const f of frame.elements) {
    if (!f.visible || f.opacity <= 0) continue;
    const el = scene.elements[f.id];
    if (!el || el.type === "group") continue;
    ctx.save();
    ctx.setTransform(sx, 0, 0, sy, -cam.x * sx, -cam.y * sy);
    ctx.globalAlpha = f.opacity;
    if (el.type === "connector") {
      drawConnector(dc, f, el);
    } else {
      const box = frameBox(f);
      ctx.translate(box.cx, box.cy);
      if (f.rotation) ctx.rotate((f.rotation * Math.PI) / 180);
      if (f.scale !== 1) ctx.scale(f.scale, f.scale);
      applyWipeClip(ctx, f, localBox(f));
      if (OUTLINE_KINDS.has(el.type)) drawShape(dc, f, el);
      else if (el.type === "icon") drawIcon(dc, f, el);
      else if (el.type === "text") drawStandaloneText(dc, f, el);
    }
    ctx.restore();
  }

  ctx.save();
  ctx.setTransform(sx, 0, 0, sy, -cam.x * sx, -cam.y * sy);
  drawParticles(dc, frame.particles);
  ctx.restore();
}

/** Evaluate and draw the scene at `timeMs`. */
export function renderScene(ctx: Ctx2D, scene: Scene, timeMs: number, opts: RenderOptions): FrameState {
  const { frame, routes } = evaluateWithLayout(scene, timeMs);
  renderFrame(ctx, scene, frame, routes, opts);
  return frame;
}
