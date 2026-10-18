import { type Caption, type ElementFrame, type FrameState, type Particle, captionAt } from "@anivo/engine";
import { type Polyline, evaluateWithLayout, frameBox, pointAt, polyline, slice } from "@anivo/layout";
import type { ConnectorElement, Element, Point, Scene, SceneStyle } from "@anivo/schema";
import { type Rgba, toCss, withAlpha } from "./color.js";
import type { Ctx2D } from "./ctx.js";
import { TOKEN_COLORS, diffLines, highlightLine } from "./highlight.js";
import { getIcon } from "./icons.js";
import { fitRect, getImage } from "./images.js";
import { type Box, type OutlineKind, cleanOutline, sketchOutline } from "./outline.js";
import { type Theme, resolveColor, resolveToken, sceneTheme } from "./theme.js";

export interface RenderOptions {
  /** Output size in device pixels. */
  width: number;
  height: number;
  /** Override the scene style. */
  style?: SceneStyle;
  /** Override the scene theme. */
  theme?: string;
  /** Override the camera, for example the pan and zoom of the editor view. */
  camera?: { x: number; y: number; width: number; height: number };
  /**
   * Draw elements that are not visible at this opacity (0..1). The editor
   * uses it so the user can see and edit elements before they enter.
   */
  ghostHidden?: number;
  /** Elements that the editor does not draw ("hidden in editor"). Exports do not set it. */
  skipIds?: ReadonlySet<string>;
  /** Burned-in captions (docs/08 "Captions"). Make the list one time with `sceneCaptions`. */
  captions?: { list: Caption[]; position?: "bottom" | "top" };
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
  if (progress >= 1) {
    // Full stroke: one path and one stroke call for all polylines (faster than one call each).
    ctx.beginPath();
    for (const line of strokes) {
      const pts = line.points;
      if (pts.length < 2) continue;
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    }
    ctx.stroke();
    return;
  }
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

/** Text layout cache (docs/06 "Cache rules"): font, text, and width give the same lines. */
const wrapCache = new Map<string, string[]>();

function wrapText(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const key = `${ctx.font}|${Math.round(maxWidth)}|${text}`;
  const hit = wrapCache.get(key);
  if (hit) return hit;
  const lines = wrapTextUncached(ctx, text, maxWidth);
  if (wrapCache.size > 5000) wrapCache.clear();
  wrapCache.set(key, lines);
  return lines;
}

function wrapTextUncached(ctx: Ctx2D, text: string, maxWidth: number): string[] {
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
  const { ctx, theme } = dc;
  const b = localBox(f);
  const color = resolveColor(theme, f.stroke ?? "text", "stroke", el.type);
  const shape = el.type === "icon" ? getIcon(el.pack, el.name) : undefined;
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (!shape) {
    // The pack or the icon is not registered: draw a placeholder. Lint reports unknown icons.
    const clean = cleanOutline("rectangle", b, Math.min(b.width, b.height) * 0.25);
    ctx.strokeStyle = toCss(color);
    ctx.lineWidth = 3;
    strokeProgressive(ctx, [clean], clean.length, f.strokeProgress);
  } else {
    const [vx, vy, vw, vh] = shape.viewBox;
    const sc = Math.min(b.width / vw, b.height / vh);
    const ox = b.x + (b.width - vw * sc) / 2 - vx * sc;
    const oy = b.y + (b.height - vh * sc) / 2 - vy * sc;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sc, sc);
    ctx.strokeStyle = toCss(color);
    if (shape.kind === "stroke") {
      // Keep the line width of the pack design, or use the element override in scene pixels.
      ctx.lineWidth = el.style.strokeWidth !== undefined ? el.style.strokeWidth / sc : shape.strokeWidth;
      strokeProgressive(ctx, shape.strokes, shape.totalLength, f.strokeProgress);
    } else {
      if (f.fillProgress > 0) {
        ctx.fillStyle = toCss(withAlpha(color, f.fillProgress));
        ctx.beginPath();
        for (const sp of shape.subpaths) {
          ctx.moveTo(sp.points[0]!.x, sp.points[0]!.y);
          for (let i = 1; i < sp.points.length; i++) ctx.lineTo(sp.points[i]!.x, sp.points[i]!.y);
          ctx.closePath();
        }
        ctx.fill();
      }
      if (f.strokeProgress < 1) {
        // Draw-on of a fill icon: trace the outline, then the fill fades in.
        ctx.lineWidth = 1 / sc;
        strokeProgressive(ctx, shape.strokes, shape.totalLength, f.strokeProgress);
      }
    }
    ctx.restore();
  }

  if (f.label) {
    const labelBox = { x: b.x - 80, y: b.y + b.height + 4, width: b.width + 160, height: 48 };
    drawLabel(dc, f, el, labelBox, f.fillProgress);
  }
}

/** Code block (FR-CANVAS-12) with highlight, type, and diff states (FR-STEP-09). */
function drawImage(dc: DrawContext, f: ElementFrame, el: Extract<Element, { type: "image" }>): void {
  const { ctx, theme } = dc;
  const b = localBox(f);
  const radius = f.cornerRadius ?? el.style.cornerRadius ?? 0;
  const outline = cleanOutline("rectangle", b, radius);
  const img = getImage(el.assetId);
  if (f.fillProgress > 0) {
    ctx.save();
    ctx.globalAlpha *= f.fillProgress;
    if (img) {
      // Clip to the box: "cover" draws outside it, and the corners can be round.
      ctx.beginPath();
      ctx.moveTo(outline.points[0]!.x, outline.points[0]!.y);
      for (let i = 1; i < outline.points.length; i++) ctx.lineTo(outline.points[i]!.x, outline.points[i]!.y);
      ctx.closePath();
      ctx.clip();
      const r = fitRect(img.width, img.height, b, el.fit);
      ctx.drawImage(img as never, r.x, r.y, r.width, r.height);
    } else {
      // Not decoded (yet): a placeholder box.
      ctx.fillStyle = toCss(resolveColor(theme, "surface-strong", "fill", "rectangle"));
      fillPolyline(ctx, outline.points);
    }
    ctx.restore();
  }
  // The border: the element stroke, or a temporary line while the image draws on.
  const stroke = el.style.stroke !== undefined ? resolveColor(theme, el.style.stroke, "stroke", "rectangle") : f.strokeProgress < 1 ? resolveColor(theme, "line", "stroke", "rectangle") : null;
  if (stroke && stroke.a > 0 && f.strokeProgress > 0) {
    ctx.strokeStyle = toCss(stroke);
    ctx.lineWidth = el.style.strokeWidth ?? 2;
    ctx.setLineDash([]);
    strokeProgressive(ctx, [outline], outline.length, f.strokeProgress);
  }
}

/** The grid of a table: header fill, outer border, and row and column lines. The cells draw as text elements. */
function drawTable(dc: DrawContext, f: ElementFrame, el: Extract<Element, { type: "table" }>): void {
  const { ctx, theme } = dc;
  const b = localBox(f);
  const radius = f.cornerRadius ?? el.style.cornerRadius ?? 8;
  const strokeWidth = f.strokeWidth ?? el.style.strokeWidth ?? 2;
  const stroke = resolveColor(theme, f.stroke ?? "line", "stroke", "rectangle");
  const fill = resolveColor(theme, f.fill ?? "surface", "fill", "rectangle");
  const headerFill = resolveColor(theme, "surface-strong", "fill", "rectangle");
  const outline = cleanOutline("rectangle", b, radius);
  const rowH = b.height / el.rows;
  const colW = b.width / el.cols;

  if (f.fillProgress > 0) {
    if (fill.a > 0) {
      ctx.fillStyle = toCss(withAlpha(fill, f.fillProgress));
      fillPolyline(ctx, outline.points);
    }
    if (el.header) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(outline.points[0]!.x, outline.points[0]!.y);
      for (let i = 1; i < outline.points.length; i++) ctx.lineTo(outline.points[i]!.x, outline.points[i]!.y);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = toCss(withAlpha(headerFill, f.fillProgress));
      ctx.fillRect(b.x, b.y, b.width, rowH);
      ctx.restore();
    }
  }
  if (f.highlight > 0) {
    const hc = resolveToken(theme, f.highlightColor ?? "warning-soft", "fill", "rectangle");
    ctx.fillStyle = toCss(withAlpha(hc, f.highlight));
    fillPolyline(ctx, outline.points);
  }
  if (stroke.a > 0 && strokeWidth > 0 && f.strokeProgress > 0) {
    ctx.strokeStyle = toCss(stroke);
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    // Draw-on: the border first, then the inner lines.
    const lines: Polyline[] = [outline];
    for (let r = 1; r < el.rows; r++) lines.push(polyline([{ x: b.x, y: b.y + r * rowH }, { x: b.x + b.width, y: b.y + r * rowH }]));
    for (let c = 1; c < el.cols; c++) lines.push(polyline([{ x: b.x + c * colW, y: b.y }, { x: b.x + c * colW, y: b.y + b.height }]));
    strokeProgressive(ctx, lines, lines.reduce((sum, l) => sum + l.length, 0), f.strokeProgress);
  }
}

function drawCode(dc: DrawContext, f: ElementFrame, el: Extract<Element, { type: "code" }>): void {
  const { ctx, theme } = dc;
  const b = localBox(f);
  const radius = f.cornerRadius ?? el.style.cornerRadius ?? 12;
  const fill = resolveColor(theme, f.fill ?? "surface-strong", "fill", el.type);
  const outline = cleanOutline("rectangle", b, radius);
  ctx.fillStyle = toCss(withAlpha(fill, f.fillProgress));
  fillPolyline(ctx, outline.points);
  if (f.strokeProgress > 0) {
    ctx.strokeStyle = toCss(resolveColor(theme, f.stroke ?? "line", "stroke", el.type));
    ctx.lineWidth = f.strokeWidth ?? el.style.strokeWidth ?? 1.5;
    ctx.setLineDash([]);
    strokeProgressive(ctx, [outline], outline.length, f.strokeProgress);
  }
  const size = f.fontSize ?? el.style.fontSize ?? 24;
  const lh = size * 1.5;
  const pad = size;
  const font = `400 ${size}px "${el.style.fontFamily ?? theme.fonts.code}"`;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const code = f.code ?? el.code;
  const gutter = el.lineNumbers ? ctx.measureText(String(code.split("\n").length)).width + size : 0;
  const x0 = b.x + pad + gutter;
  const color = (token: string) => resolveToken(theme, token, "textColor", "text");

  // Rows: plain lines, or diff rows during a diff (removed rows shrink, added rows grow).
  type Row = { text: string; kind: "same" | "removed" | "added"; h: number };
  let rows: Row[];
  if (f.codeFrom !== undefined && f.codeMix !== undefined) {
    const p = f.codeMix;
    rows = diffLines(f.codeFrom.split("\n"), code.split("\n")).map((r) => ({ ...r, h: r.kind === "removed" ? 1 - p : r.kind === "added" ? p : 1 }));
  } else rows = code.split("\n").map((text) => ({ text, kind: "same" as const, h: 1 }));

  // Highlight: a bar behind the range, and dim lines outside it.
  const lines = f.codeLines;
  const mix = f.codeLinesMix ?? 1;
  const inRange = (n: number, r?: [number, number]) => !!r && n >= r[0] && n <= r[1];
  const dimOf = (n: number) => {
    const now = lines ? (inRange(n, lines) ? 1 : 0.35) : 1;
    const before = f.codeLinesMix !== undefined ? (f.codeLinesFrom ? (inRange(n, f.codeLinesFrom) ? 1 : 0.35) : 1) : now;
    return before + (now - before) * mix;
  };
  const barFor = (r?: [number, number]) => (r ? { y: b.y + pad + (r[0] - 1) * lh, h: (r[1] - r[0] + 1) * lh } : undefined);
  const barTo = barFor(lines);
  const barFrom = f.codeLinesMix !== undefined ? barFor(f.codeLinesFrom) : barTo;
  const bar = barTo && barFrom ? { y: barFrom.y + (barTo.y - barFrom.y) * mix, h: barFrom.h + (barTo.h - barFrom.h) * mix, a: 1 } : barTo ? { ...barTo, a: mix } : barFrom ? { ...barFrom, a: 1 - mix } : undefined;
  if (bar && rows.every((r) => r.kind === "same")) {
    ctx.fillStyle = toCss(withAlpha(resolveToken(theme, "accent-soft", "fill", "rectangle"), bar.a * f.fillProgress));
    ctx.fillRect(b.x + 6, bar.y, b.width - 12, bar.h);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.width, b.height);
  ctx.clip();
  let y = b.y + pad;
  let lineNo = 0;
  for (const row of rows) {
    if (row.kind !== "removed") lineNo++;
    const h = lh * row.h;
    if (h < 0.5) continue;
    if (row.kind !== "same") {
      ctx.fillStyle = toCss(withAlpha(resolveToken(theme, row.kind === "added" ? "success-soft" : "danger-soft", "fill", "rectangle"), f.fillProgress));
      ctx.fillRect(b.x + 6, y, b.width - 12, h);
    }
    // A row that grows or shrinks shows its text only when it is more than half open, so rows do not overlap.
    let alpha = f.fillProgress * (row.kind === "same" ? dimOf(lineNo) : 1) * Math.max(0, Math.min(1, (row.h - 0.5) / 0.5));
    // Typing: lines in the range show their first characters only.
    let text = row.text;
    const t = f.codeType;
    if (t && row.kind === "same" && lineNo >= t.lines[0] && lineNo <= t.lines[1]) {
      const all = rows.slice(t.lines[0] - 1, t.lines[1]).reduce((n, r) => n + r.text.length, 0);
      const before = rows.slice(t.lines[0] - 1, lineNo - 1).reduce((n, r) => n + r.text.length, 0);
      const shown = Math.floor(all * t.p) - before;
      text = shown <= 0 ? "" : row.text.slice(0, shown);
      if (shown <= 0) alpha = 0;
    }
    const cy = y + h / 2;
    if (el.lineNumbers && row.kind !== "removed") {
      ctx.textAlign = "right";
      ctx.fillStyle = toCss(withAlpha(color("muted"), alpha * 0.8));
      ctx.fillText(String(lineNo), b.x + pad + gutter - size * 0.6, cy);
      ctx.textAlign = "left";
    }
    let x = x0;
    for (const tok of highlightLine(text, el.language)) {
      ctx.fillStyle = toCss(withAlpha(color(TOKEN_COLORS[tok.kind]), alpha));
      ctx.fillText(tok.text, x, cy);
      x += ctx.measureText(tok.text).width;
    }
    y += h;
  }
  ctx.restore();
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
  if (f.label && f.strokeProgress >= 1) {
    // The label sits on the line with a background pill, so the line does not cross the text.
    const mid = pointAt(route, route.length / 2).point;
    ctx.font = fontFor(dc, { ...f, fontSize: f.fontSize ?? el.style.fontSize ?? 24 }, el);
    const lines = wrapText(ctx, f.label, 320);
    const size = f.fontSize ?? el.style.fontSize ?? 24;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
    const h = lines.length * size * 1.25 + 10;
    const bg = resolveToken(theme, dc.scene.settings.background.color ?? "background", "fill", "rectangle");
    ctx.fillStyle = toCss(bg.a > 0 ? bg : resolveToken(theme, "surface", "fill", "rectangle"));
    fillPolyline(ctx, cleanOutline("rectangle", { x: mid.x - w / 2, y: mid.y - h / 2, width: w, height: h }, Math.min(h / 2, 10)).points);
    drawLabel(dc, { ...f, fontSize: size }, el, { x: mid.x - w / 2 - 2, y: mid.y - h / 2, width: w + 4, height: h }, 1);
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
    theme: sceneTheme(scene, opts.theme ?? scene.settings.theme),
    style: opts.style ?? scene.settings.style,
    routes,
  };
  const view: FrameState = opts.camera ? { ...frame, camera: opts.camera } : frame;
  drawBackground(dc, view, opts);
  const cam = view.camera;
  const ghost = opts.ghostHidden ?? 0;
  const sx = opts.width / cam.width;
  const sy = opts.height / cam.height;

  for (const frameEl of frame.elements) {
    let f = frameEl;
    if (!f.visible) {
      if (ghost <= 0) continue;
      f = { ...f, visible: true, opacity: ghost, strokeProgress: 1, fillProgress: 1, textReveal: 1 };
    }
    if (f.opacity <= 0) continue;
    const el = scene.elements[f.id];
    if (!el || el.type === "group" || opts.skipIds?.has(f.id)) continue;
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
      else if (el.type === "code") drawCode(dc, f, el);
      else if (el.type === "image") drawImage(dc, f, el);
      else if (el.type === "table") drawTable(dc, f, el);
      else if (el.type === "text") drawStandaloneText(dc, f, el);
    }
    ctx.restore();
  }

  ctx.save();
  ctx.setTransform(sx, 0, 0, sy, -cam.x * sx, -cam.y * sy);
  drawParticles(dc, frame.particles);
  ctx.restore();
}

/**
 * Draw the caption for `timeMs` in output pixels: white text on a dark box,
 * centered near the bottom (or top) edge. Size follows the output height.
 */
export function drawCaption(ctx: Ctx2D, scene: Scene, timeMs: number, opts: RenderOptions): void {
  const cap = opts.captions && captionAt(opts.captions.list, timeMs);
  if (!cap) return;
  const theme = sceneTheme(scene, opts.theme ?? scene.settings.theme);
  const size = Math.max(12, Math.round(opts.height * 0.042));
  const lineH = Math.round(size * 1.3);
  const padX = Math.round(size * 0.6);
  const padY = Math.round(size * 0.3);
  const margin = Math.round(opts.height * 0.06);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.font = `500 ${size}px "${theme.fonts.clean}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const boxW = Math.max(...cap.lines.map((l) => ctx.measureText(l).width)) + padX * 2;
  const boxH = cap.lines.length * lineH + padY * 2;
  const x = opts.width / 2;
  const top = opts.captions?.position === "top" ? margin : opts.height - margin - boxH;
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillRect(Math.round(x - boxW / 2), top, Math.round(boxW), boxH);
  ctx.fillStyle = "#FFFFFF";
  cap.lines.forEach((l, i) => ctx.fillText(l, x, top + padY + lineH * (i + 0.5)));
  ctx.restore();
}

/** Evaluate and draw the scene at `timeMs`. */
export function renderScene(ctx: Ctx2D, scene: Scene, timeMs: number, opts: RenderOptions): FrameState {
  const { frame, routes } = evaluateWithLayout(scene, timeMs);
  renderFrame(ctx, scene, frame, routes, opts);
  drawCaption(ctx, scene, timeMs, opts);
  return frame;
}
