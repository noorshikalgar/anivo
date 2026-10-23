import { type Caption, type ElementFrame, type FrameState, type Particle, captionAt } from "@anivo/engine";
import { type Polyline, evaluateWithLayout, frameBox, pointAt, polyline, slice } from "@anivo/layout";
import type { ConnectorElement, Element, Point, Scene, SceneStyle } from "@anivo/schema";
import { type Rgba, mixOklch, parseHex, toCss, withAlpha } from "./color.js";
import type { Ctx2D } from "./ctx.js";
import { TOKEN_COLORS, diffLines, highlightLine } from "./highlight.js";
import { getIcon } from "./icons.js";
import { fitRect, getImage } from "./images.js";
import { type Box, type OutlineKind, blendOutlines, cleanOutline, sketchOutline } from "./outline.js";
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
  /** Do not draw the background (for passes over a frame). */
  noBackground?: boolean;
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

/** Fallback font for arrows, check marks, and shapes (assets/fonts/anivo-symbols.woff2). */
const SYMBOLS = "Anivo Symbols";
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
  return `${weight} ${size}px "${family}", "${SYMBOLS}"`;
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
  // A text element has no box, so no inner padding: its text starts at its edge (docs/20 B2).
  const pad = el.type === "text" ? 0 : 12;
  const lines = wrapText(ctx, text, Math.max(10, box.width - pad * 2));
  const align = el.style.textAlign ?? "center";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = toCss(withAlpha(color, alpha));
  const total = text.length;
  // Round, so the last character shows before the end of the action (a contact sheet samples just before the end).
  let shown = reveal >= 1 ? total : Math.round(total * reveal);
  const x = align === "left" ? box.x + pad : align === "right" ? box.x + box.width - pad : box.x + box.width / 2;
  const y0 = box.y + box.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  if ((f.cascade !== undefined && f.cascade < 1) || (f.scramble !== undefined && f.scramble < 1)) return drawLetters(dc, f, el, lines, x, y0, lineHeight, size, color, alpha);
  if (f.marks?.length || f.dimRest) return drawMarkedText(dc, f, el, text, lines, x, y0, lineHeight, size, color, alpha, shown);
  lines.forEach((line, i) => {
    if (shown <= 0) return;
    const part = line.slice(0, shown);
    shown -= line.length + 1;
    ctx.fillText(part, x, y0 + i * lineHeight);
  });
}

const SCRAMBLE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789#$%&*+=?";

/** A number from 0 to 1 from two integers: the same input gives the same output (no clock, no random). */
function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Letter effects (docs/21 C1): cascade (each letter rises and fades in after
 * the one before) and scramble (random letters settle into the text from the
 * left). The letters are drawn one by one at the places of the full line.
 */
function drawLetters(dc: DrawContext, f: ElementFrame, el: Element, lines: string[], x: number, y0: number, lineHeight: number, size: number, base: Rgba, alpha: number): void {
  const { ctx } = dc;
  const align = el.style.textAlign ?? "center";
  ctx.textAlign = "left";
  const total = lines.reduce((n, l) => n + l.length + 1, 0);
  const WINDOW = 6;
  let idx = 0;
  lines.forEach((line, i) => {
    const width = ctx.measureText(line).width;
    const left = align === "left" ? x : align === "right" ? x - width : x - width / 2;
    const y = y0 + i * lineHeight;
    for (let j = 0; j < line.length; j++, idx++) {
      let ch = line[j]!;
      if (ch === " ") continue;
      const cx = left + ctx.measureText(line.slice(0, j)).width;
      let a = alpha;
      let dy = 0;
      if (f.cascade !== undefined && f.cascade < 1) {
        const lp = Math.min(1, Math.max(0, (f.cascade * (total + WINDOW) - idx) / WINDOW));
        const e = 1 - (1 - lp) ** 3;
        a *= lp;
        dy = (1 - e) * size * 0.5;
      }
      let center = false;
      if (f.scramble !== undefined && f.scramble < 1) {
        // Decode: the letters up to the front are right, the next few are random, the rest do not show yet.
        const front = f.scramble * (total + WINDOW);
        if (idx >= front) continue;
        if (idx >= front - WINDOW) {
          ch = SCRAMBLE[Math.floor(hash2(idx, Math.floor(f.scramble * 40)) * SCRAMBLE.length)]!;
          a *= 0.6;
          center = true;
        }
      }
      if (a <= 0) continue;
      ctx.fillStyle = toCss(withAlpha(base, a));
      if (center) {
        // A random letter sits in the middle of the place of the right letter, so the line does not jump.
        const w = ctx.measureText(line[j]!).width;
        ctx.textAlign = "center";
        ctx.fillText(ch, cx + w / 2, y + dy);
        ctx.textAlign = "left";
      } else ctx.fillText(ch, cx, y + dy);
    }
    idx++;
  });
}

/**
 * Text with marked words (docs/20 B1): each line is drawn in parts, so a
 * phrase can have its own color, a highlight box behind it, and an underline
 * that draws in. The other words can fade to the dim color.
 */
function drawMarkedText(dc: DrawContext, f: ElementFrame, el: Element, text: string, lines: string[], x: number, y0: number, lineHeight: number, size: number, base: Rgba, alpha: number, shown: number): void {
  const { ctx, theme } = dc;
  const marks = f.marks ?? [];
  const dim = f.dimRest;
  const tok = (c: string, role: "fill" | "textColor" | "stroke") => resolveToken(theme, c, role, el.type);
  const align = el.style.textAlign ?? "center";
  ctx.textAlign = "left";
  // The index of each line in the text (wrapping drops one space or new line between lines).
  let cursor = 0;
  lines.forEach((line, i) => {
    const start = text.indexOf(line, cursor);
    const lineStart = start < 0 ? cursor : start;
    cursor = lineStart + line.length;
    const visible = Math.max(0, Math.min(line.length, shown - lineStart));
    if (visible <= 0) return;
    const width = ctx.measureText(line).width;
    const left = align === "left" ? x : align === "right" ? x - width : x - width / 2;
    const y = y0 + i * lineHeight;
    // Parts: cut the line at the start and the end of each mark.
    const cuts = new Set([0, line.length]);
    for (const m of marks) for (const c of [m.start - lineStart, m.end - lineStart]) if (c > 0 && c < line.length) cuts.add(c);
    const edges = [...cuts].sort((a, b) => a - b);
    for (let k = 0; k < edges.length - 1; k++) {
      const a = edges[k]!;
      const b = Math.min(edges[k + 1]!, visible);
      if (b <= a) continue;
      const part = line.slice(a, b);
      const px = left + ctx.measureText(line.slice(0, a)).width;
      const pw = ctx.measureText(part).width;
      const mark = marks.find((m) => m.start - lineStart <= a && m.end - lineStart >= b);
      let c = base;
      if (mark?.color) c = mixOklch(base, tok(mark.color, "textColor"), mark.p);
      else if (!mark && dim) c = mixOklch(base, tok(dim.color, "textColor"), dim.p);
      if (mark?.highlight) {
        // A marker sweep: the box grows from the left (docs/21 C1).
        const pad = size * 0.18;
        ctx.fillStyle = toCss(withAlpha(tok(mark.highlight, "fill"), alpha));
        ctx.beginPath();
        ctx.rect(px - pad, y - size * 0.62, (pw + pad * 2) * Math.min(1, mark.p), size * 1.24);
        ctx.fill();
      }
      ctx.fillStyle = toCss(withAlpha(c, alpha));
      ctx.fillText(part, px, y);
      if (mark?.strike && mark.p > 0) {
        ctx.fillStyle = toCss(withAlpha(tok(mark.strike, "stroke"), alpha));
        ctx.fillRect(px, y - Math.max(1, size * 0.03), pw * Math.min(1, mark.p), Math.max(2, size * 0.06));
      }
      if (mark?.underline && mark.p > 0) {
        ctx.fillStyle = toCss(withAlpha(tok(mark.underline, "stroke"), alpha));
        ctx.fillRect(px, y + size * 0.56, pw * Math.min(1, mark.p), Math.max(2, size * 0.06));
      }
    }
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

/**
 * A shadow under a shape (docs/05 style "shadow"): soft (blur, made of
 * layers), hard (a solid offset copy), or glow (a colored halo). Layers, not
 * a canvas shadow, so the SVG export draws the same picture.
 */
function drawShadow(dc: DrawContext, el: Element, kind: OutlineKind, b: Box, radius: number, strokeWidth: number, alpha: number): void {
  const { ctx, theme } = dc;
  const mode = el.style.shadow ?? theme.defaults.shadow ?? "none";
  if (mode === "none") return;
  const colorToken = el.style.shadowColor ?? theme.defaults.shadowColor;
  const shape = kind === "line" ? "rectangle" : kind;
  if (mode === "hard") {
    const c = colorToken ? resolveToken(theme, colorToken, "stroke", el.type) : theme.dark ? parseHex("#000000") : resolveToken(theme, "text", "textColor", el.type);
    const off = Math.max(6, strokeWidth * 2.5);
    ctx.fillStyle = toCss(withAlpha(c, alpha * (theme.dark ? 0.9 : 1)));
    fillPolyline(ctx, cleanOutline(shape, { x: b.x + off, y: b.y + off, width: b.width, height: b.height }, radius).points);
    return;
  }
  const glow = mode === "glow";
  const c = colorToken ? resolveToken(theme, colorToken, "stroke", el.type) : glow ? resolveToken(theme, "accent", "stroke", el.type) : parseHex("#000000");
  const layers = glow ? 7 : 8;
  for (let i = layers; i >= 1; i--) {
    const grow = glow ? i * 3.2 : i * 2.2;
    const dy = glow ? 0 : 6 + i * 0.6;
    ctx.fillStyle = toCss(withAlpha(c, alpha * (glow ? 0.07 : theme.dark ? 0.09 : 0.05)));
    fillPolyline(ctx, cleanOutline(shape, { x: b.x - grow, y: b.y - grow + dy, width: b.width + grow * 2, height: b.height + grow * 2 }, radius + grow).points);
  }
}

function drawShape(dc: DrawContext, f: ElementFrame, el: Element): void {
  const { ctx, theme } = dc;
  const kind = (f.shape ?? el.type) as OutlineKind;
  const b = localBox(f);
  const radius = f.cornerRadius ?? el.style.cornerRadius ?? theme.defaults.cornerRadius;
  const morphing = f.shapeFrom !== undefined && f.shapeMix !== undefined;
  const strokeWidth = f.strokeWidth ?? el.style.strokeWidth ?? theme.defaults.strokeWidth;
  const fill = resolveColor(theme, f.fill, "fill", el.type);
  const stroke = resolveColor(theme, f.stroke, "stroke", el.type);
  const clean = morphing ? blendOutlines(cleanOutline(f.shapeFrom!, b, radius), cleanOutline(kind, b, radius), f.shapeMix!) : cleanOutline(kind, b, radius);

  if (f.highlight > 0) {
    const hc = resolveToken(theme, f.highlightColor ?? "warning-soft", "fill", el.type);
    ctx.fillStyle = toCss(withAlpha(hc, f.highlight));
    fillPolyline(ctx, cleanOutline(kind === "line" ? "rectangle" : kind, { x: b.x - 14, y: b.y - 14, width: b.width + 28, height: b.height + 28 }, radius + 14).points);
  }

  if (kind !== "line" && f.fillProgress > 0) drawShadow(dc, el, kind, b, radius, strokeWidth, f.fillProgress);
  if (kind !== "line" && fill.a > 0 && f.fillProgress > 0) {
    const to = el.style.gradient ? resolveToken(theme, el.style.gradient, "fill", el.type) : undefined;
    if (to) {
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height);
      g.addColorStop(0, toCss(withAlpha(fill, f.fillProgress)));
      g.addColorStop(1, toCss(withAlpha(to, f.fillProgress)));
      ctx.fillStyle = g;
    } else ctx.fillStyle = toCss(withAlpha(fill, f.fillProgress));
    fillPolyline(ctx, clean.points);
  }
  if (f.flash > 0 && kind !== "line") {
    const fc = resolveToken(theme, f.flashColor ?? "warning", "fill", el.type);
    ctx.fillStyle = toCss(withAlpha(fc, f.flash * 0.35));
    fillPolyline(ctx, clean.points);
  }

  if (stroke.a > 0 && strokeWidth > 0 && f.strokeProgress > 0) {
    ctx.strokeStyle = toCss(stroke);
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dashFor(el, strokeWidth));
    if (dc.style === "sketch" && !morphing) {
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
  let color = resolveColor(theme, f.stroke ?? "text", "stroke", el.type);
  const shape = el.type === "icon" ? getIcon(el.pack, el.name) : undefined;
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // A fill on an icon is a badge: a colored circle with the icon inside it.
  let ib = b;
  const badge = el.style.fill !== undefined && f.fill !== undefined ? resolveColor(theme, f.fill, "fill", el.type) : undefined;
  if (badge && badge.a > 0 && f.fillProgress > 0) {
    const r = Math.min(b.width, b.height) / 2;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const disc = { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
    drawShadow(dc, el, "ellipse", disc, r, 2, f.fillProgress);
    ctx.fillStyle = toCss(withAlpha(badge, f.fillProgress));
    fillPolyline(ctx, cleanOutline("ellipse", disc, r).points);
    const inset = r * 0.46;
    ib = { x: cx - r + inset, y: cy - r + inset, width: (r - inset) * 2, height: (r - inset) * 2 };
    if (f.stroke === undefined) {
      const lum = 0.2126 * badge.r + 0.7152 * badge.g + 0.0722 * badge.b;
      color = lum < 0.6 ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0.07, g: 0.07, b: 0.07, a: 1 };
    }
  }

  if (!shape) {
    // The pack or the icon is not registered: draw a placeholder. Lint reports unknown icons.
    const clean = cleanOutline("rectangle", b, Math.min(b.width, b.height) * 0.25);
    ctx.strokeStyle = toCss(color);
    ctx.lineWidth = 3;
    strokeProgressive(ctx, [clean], clean.length, f.strokeProgress);
  } else {
    const [vx, vy, vw, vh] = shape.viewBox;
    const sc = Math.min(ib.width / vw, ib.height / vh);
    const ox = ib.x + (ib.width - vw * sc) / 2 - vx * sc;
    const oy = ib.y + (ib.height - vh * sc) / 2 - vy * sc;
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
    // The label is under the icon. A long label wraps, and its box grows down (not up into the icon).
    const width = b.width + 160;
    ctx.font = fontFor(dc, f, el);
    const size = f.fontSize ?? el.style.fontSize ?? theme.defaults.fontSize;
    const lines = wrapText(ctx, f.label, Math.max(10, width - 24)).length;
    const labelBox = { x: b.x - 80, y: b.y + b.height + 4, width, height: Math.max(48, lines * size * 1.25 + 8) };
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
  const size = f.fontSize ?? el.style.fontSize ?? 28;
  const lh = size * 1.5;
  const pad = size;
  const font = `400 ${size}px "${el.style.fontFamily ?? theme.fonts.code}", "${SYMBOLS}"`;
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
  // Arrows read better a little thicker than shape outlines (docs/20 E2).
  const strokeWidth = f.strokeWidth ?? el.style.strokeWidth ?? Math.max(2.5, theme.defaults.strokeWidth);
  const css = toCss(stroke);
  ctx.strokeStyle = css;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(f.march !== undefined && el.style.strokeStyle !== "dotted" ? [strokeWidth * 4, strokeWidth * 3] : dashFor(el, strokeWidth));
  if (f.march !== undefined && "lineDashOffset" in ctx) ctx.lineDashOffset = -f.march * 60;
  if (dc.style === "sketch") {
    const key = `${el.id}|${route.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(";")}`;
    const sk = sketchOutline(key, { points: route.points }, el.seed, el.style.roughness ?? 1, strokeWidth);
    strokeProgressive(ctx, sk.strokes, sk.totalLength, f.strokeProgress);
  } else {
    strokeProgressive(ctx, [route], route.length, f.strokeProgress);
  }
  ctx.setLineDash([]);
  if ("lineDashOffset" in ctx) ctx.lineDashOffset = 0;
  // The arrowhead moves with the tip of the line during draw-on.
  const headSize = 12 + strokeWidth * 4;
  const tip = pointAt(route, route.length * f.strokeProgress);
  drawArrowHead(ctx, tip.point, tip.dir, headSize, el.endHead, css);
  if (el.startHead !== "none") {
    const start = pointAt(route, 0);
    drawArrowHead(ctx, start.point, { x: -start.dir.x, y: -start.dir.y }, headSize, el.startHead, css);
  }
  if (f.label && f.strokeProgress >= 0.85) {
    // The label fades in at the end of the draw.
    ctx.globalAlpha *= Math.min(1, (f.strokeProgress - 0.85) / 0.15);
    // The label sits on the line with a background pill, so the line does not cross the text.
    const mid = pointAt(route, route.length / 2).point;
    ctx.font = fontFor(dc, { ...f, fontSize: f.fontSize ?? el.style.fontSize ?? 28 }, el);
    const lines = wrapText(ctx, f.label, 320);
    const size = f.fontSize ?? el.style.fontSize ?? 28;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
    const h = lines.length * size * 1.25 + 10;
    const bg = resolveToken(theme, dc.scene.settings.background.color ?? "background", "fill", "rectangle");
    ctx.fillStyle = toCss(bg.a > 0 ? bg : resolveToken(theme, "surface", "fill", "rectangle"));
    fillPolyline(ctx, cleanOutline("rectangle", { x: mid.x - w / 2, y: mid.y - h / 2, width: w, height: h }, Math.min(h / 2, 10)).points);
    drawLabel(dc, { ...f, fontSize: size }, el, { x: mid.x - w / 2 - 2, y: mid.y - h / 2, width: w + 4, height: h }, 1);
  }
}

/** Copies behind a particle with a trail, and their opacity. */
const TRAIL_COPIES = 6;

function drawParticle(dc: DrawContext, p: Particle, x: number, y: number, dir: { x: number; y: number }, css: string): void {
  const { ctx } = dc;
  const r = p.size / 2;
  ctx.save();
  ctx.translate(x, y);
  if (p.orient) ctx.rotate(Math.atan2(dir.y, dir.x));
  if (p.shape === "icon" || p.shape === "image") {
    if (p.shape === "image" && p.assetId) {
      const img = getImage(p.assetId);
      if (img) {
        const h = (p.size * img.height) / Math.max(1, img.width);
        ctx.drawImage(img as never, -r, -h / 2, p.size, h);
        ctx.restore();
        return;
      }
    }
    const [pack, name] = (p.icon ?? "").split(":");
    const shape = p.shape === "icon" && pack && name ? getIcon(pack, name) : undefined;
    if (shape) {
      const [vx, vy, vw, vh] = shape.viewBox;
      const sc = p.size / Math.max(vw, vh);
      ctx.scale(sc, sc);
      ctx.translate(-vx - vw / 2, -vy - vh / 2);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (shape.kind === "stroke") {
        ctx.strokeStyle = css;
        ctx.lineWidth = shape.strokeWidth;
        strokeProgressive(ctx, shape.strokes, shape.totalLength, 1);
      } else {
        ctx.fillStyle = css;
        ctx.beginPath();
        for (const sp of shape.subpaths) {
          ctx.moveTo(sp.points[0]!.x, sp.points[0]!.y);
          for (let i = 1; i < sp.points.length; i++) ctx.lineTo(sp.points[i]!.x, sp.points[i]!.y);
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    // No icon or image (yet): a dot. Lint reports a missing icon.
  }
  ctx.fillStyle = css;
  ctx.beginPath();
  if (p.shape === "square") ctx.rect(-r, -r, p.size, p.size);
  else if (p.shape === "pill") {
    // A pill is along the path.
    if (!p.orient) ctx.rotate(Math.atan2(dir.y, dir.x));
    ctx.moveTo(-r * 2, 0);
    ctx.lineTo(r * 2, 0);
    ctx.lineWidth = p.size;
    ctx.lineCap = "round";
    ctx.strokeStyle = css;
    ctx.stroke();
    ctx.restore();
    return;
  } else ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(dc: DrawContext, particles: Particle[]): void {
  const { ctx, theme } = dc;
  for (const p of particles) {
    const route = dc.routes.get(p.connectorId);
    if (!route) continue;
    const css = toCss(resolveToken(theme, p.color, "fill", "connector"));
    const sign = p.reverse ? -1 : 1;
    const at = (distance: number) => {
      const d = p.reverse ? route.length - distance : distance;
      const { point, dir } = pointAt(route, d);
      return { point, dir: { x: dir.x * sign, y: dir.y * sign } };
    };
    if (p.trail > 0) {
      // The copies are behind the particle on the path, and they fade out.
      const gap = Math.max(2, p.size * 0.6);
      for (let i = TRAIL_COPIES; i >= 1; i--) {
        const d = p.distance - i * gap;
        if (d < 0) continue;
        const { point, dir } = at(d);
        ctx.save();
        ctx.globalAlpha *= p.trail * (1 - i / (TRAIL_COPIES + 1));
        drawParticle(dc, p, point.x, point.y, dir, css);
        ctx.restore();
      }
    }
    const { point, dir } = at(p.distance);
    drawParticle(dc, p, point.x, point.y, dir, css);
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
  if (!opts.noBackground) drawBackground(dc, view, opts);
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
    if (f.blur && f.blur > 0.3 && "filter" in ctx) ctx.filter = `blur(${(f.blur * sx).toFixed(1)}px)`;
    if (el.type === "connector") {
      drawConnector(dc, f, el);
    } else {
      const box = frameBox(f);
      // Scale and rotation turn around the origin (docs/19 R11); the shape draws around its center.
      const o = ORIGINS[el.style.origin ?? "center"] ?? [0.5, 0.5];
      // The box of frameBox is scaled already: the origin uses the full size.
      const ox = box.cx + (o[0] - 0.5) * f.width;
      const oy = box.cy + (o[1] - 0.5) * f.height;
      ctx.translate(ox, oy);
      if (f.rotation) ctx.rotate((f.rotation * Math.PI) / 180);
      if (f.scale !== 1) ctx.scale(f.scale, f.scale);
      if (ox !== box.cx || oy !== box.cy) ctx.translate(box.cx - ox, box.cy - oy);
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
  if (frame.caption) drawStepCaption(dc, frame, frame.caption, cam);
  ctx.restore();
  if (frame.transition) drawTransition(dc, frame.transition, opts);
}

const ORIGINS: Record<string, [number, number]> = {
  center: [0.5, 0.5],
  "top-left": [0, 0],
  top: [0.5, 0],
  "top-right": [1, 0],
  left: [0, 0.5],
  right: [1, 0.5],
  "bottom-left": [0, 1],
  bottom: [0.5, 1],
  "bottom-right": [1, 1],
};

type Rect4 = { x: number; y: number; width: number; height: number };

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.arc(x + w - k, y + k, k, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - k);
  ctx.arc(x + w - k, y + h - k, k, 0, Math.PI / 2);
  ctx.lineTo(x + k, y + h);
  ctx.arc(x + k, y + h - k, k, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + k);
  ctx.arc(x + k, y + k, k, Math.PI, (3 * Math.PI) / 2);
  ctx.closePath();
}

const overlap = (a: Rect4, b: Rect4) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/**
 * Place a caption box: next to the anchor where it covers the least of the
 * other elements, inside the frame (docs/17 P4). Pure: the same frame gives
 * the same place.
 */
export function placeCaption(box: { width: number; height: number }, cap: { side: string; anchor?: Rect4; anchorId?: string }, cam: Rect4, others: (Rect4 & { text?: boolean })[]): { x: number; y: number } {
  const margin = Math.round(cam.height * 0.04);
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(Math.max(p.x, cam.x + margin), cam.x + cam.width - margin - box.width),
    y: Math.min(Math.max(p.y, cam.y + margin), cam.y + cam.height - margin - box.height),
  });
  const a = cap.anchor;
  if (!a || cap.side === "top" || cap.side === "bottom") {
    const x = cam.x + (cam.width - box.width) / 2;
    return clamp({ x, y: cap.side === "bottom" ? cam.y + cam.height - margin - box.height : cam.y + margin });
  }
  const gap = Math.round(cam.height * 0.025);
  const sidesOf = (r: Rect4): Record<string, { x: number; y: number }> => {
    const cx = r.x + r.width / 2 - box.width / 2;
    const cy = r.y + r.height / 2 - box.height / 2;
    return {
      below: { x: cx, y: r.y + r.height + gap },
      above: { x: cx, y: r.y - gap - box.height },
      right: { x: r.x + r.width + gap, y: cy },
      left: { x: r.x - gap - box.width, y: cy },
    };
  };
  if (cap.side !== "auto") return clamp(sidesOf(a)[cap.side]!);
  const inside = (o: Rect4, r: Rect4) => o.x <= r.x + 1 && o.y <= r.y + 1 && o.x + o.width >= r.x + r.width - 1 && o.y + o.height >= r.y + r.height - 1;
  // The anchor first, then the boxes that contain it (for example a field in a card): the caption can go next to the card.
  const around = [a, ...others.filter((o) => inside(o, a) && (o.width > a.width + 2 || o.height > a.height + 2)).sort((x, y) => x.width * x.height - y.width * y.height)];
  let best = clamp(sidesOf(a)["below"]!);
  let bestScore = Infinity;
  around.forEach((r, level) => {
    const sides = sidesOf(r);
    for (const name of ["below", "above", "right", "left"]) {
      const want = sides[name]!;
      const p = clamp(want);
      const c = { ...p, ...box };
      // Cover less of the anchor and the other elements (text counts 3 times); stay near the wanted place and near the anchor.
      let score = overlap(c, a) * 4 + Math.hypot(p.x - want.x, p.y - want.y) * 20 + level * 2000;
      for (const o of others) score += overlap(c, o) * (o.text ? 3 : 1);
      if (score < bestScore - 1) {
        bestScore = score;
        best = p;
      }
    }
  });
  return best;
}

/** The step caption (docs/17 P4): a card with the text, that types in. Scene coordinates. */
function drawStepCaption(dc: DrawContext, frame: FrameState, cap: NonNullable<FrameState["caption"]>, cam: Rect4): void {
  const { ctx, theme } = dc;
  const v = dc.scene.settings.video;
  const size = Math.round(Math.min(v.width, v.height) * 0.037);
  const padX = Math.round(size * 0.7);
  const padY = Math.round(size * 0.45);
  const lineH = Math.round(size * 1.3);
  const bar = Math.max(3, Math.round(size * 0.12));
  ctx.font = `500 ${size}px "${theme.fonts.clean}", "${SYMBOLS}"`;
  const maxW = Math.round(cam.width * (cap.anchor ? 0.42 : 0.7));
  const lines = wrapText(ctx, cap.text, maxW - padX * 2);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const box = { width: Math.ceil(textW + padX * 2 + bar), height: lines.length * lineH + padY * 2 };
  const others = frame.elements.filter((e) => e.visible && e.opacity > 0.05 && e.type !== "group" && e.type !== "connector" && e.id !== cap.anchorId).map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height, text: e.type === "text" || !!e.label }));
  const p = placeCaption(box, cap, cam, others);
  ctx.save();
  ctx.globalAlpha = cap.opacity;
  roundRectPath(ctx, p.x, p.y, box.width, box.height, Math.round(size * 0.35));
  ctx.fillStyle = toCss(withAlpha(resolveToken(theme, "surface", "fill", "rectangle"), 0.96));
  ctx.fill();
  ctx.strokeStyle = toCss(withAlpha(resolveToken(theme, "text", "textColor", "text"), 0.12));
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = toCss(resolveToken(theme, "accent", "fill", "rectangle"));
  roundRectPath(ctx, p.x, p.y, bar * 2, box.height, bar);
  ctx.fill();
  ctx.fillStyle = toCss(resolveToken(theme, "text", "textColor", "text"));
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // Typing: show the first characters, line by line.
  let left = Math.round(cap.text.length * cap.reveal);
  lines.forEach((l, i) => {
    if (left <= 0) return;
    const part = l.slice(0, left);
    left -= l.length + 1;
    ctx.fillText(part, p.x + bar + padX, p.y + padY + lineH * (i + 0.5));
  });
  ctx.restore();
}

/** A step transition over the whole output (docs/16 section 3). */
function drawTransition(dc: DrawContext, tr: { kind: "fade" | "dip" | "flash" | "wipe"; progress: number }, opts: RenderOptions): void {
  const { ctx, theme } = dc;
  const p = Math.min(1, Math.max(0, tr.progress));
  const bg = dc.scene.settings.background.kind === "transparent" ? "background" : (dc.scene.settings.background.color ?? "background");
  const color = tr.kind === "dip" ? "#000000" : tr.kind === "flash" ? "#ffffff" : toCss(resolveToken(theme, bg, "fill", "rectangle"));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  if (tr.kind === "wipe") {
    // The band covers from the left up to the step start, then it uncovers from the left.
    const e = p < 0.5 ? p * 2 : (p - 0.5) * 2;
    const eased = e * e * (3 - 2 * e);
    if (p < 0.5) ctx.fillRect(0, 0, opts.width * eased, opts.height);
    else ctx.fillRect(opts.width * eased, 0, opts.width * (1 - eased), opts.height);
  } else {
    // Up to full at the step start, then down.
    const a = 1 - Math.abs(p - 0.5) * 2;
    ctx.globalAlpha = a * a * (3 - 2 * a);
    ctx.fillRect(0, 0, opts.width, opts.height);
  }
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
  ctx.font = `500 ${size}px "${theme.fonts.clean}", "${SYMBOLS}"`;
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

/**
 * Motion blur (docs/19 R13): for elements that moved more than 3 px since the
 * last frame, draw faint copies at two earlier times of the frame (a
 * shutter of half a frame). Pure: it only evaluates the scene again.
 */
function drawMotionBlur(ctx: Ctx2D, scene: Scene, frame: FrameState, timeMs: number, opts: RenderOptions): void {
  const frameMs = 1000 / scene.settings.video.fps;
  const now = new Map(frame.elements.map((f) => [f.id, f]));
  for (const [share, alpha] of [
    [0.25, 0.22],
    [0.5, 0.12],
  ] as const) {
    const t = Math.max(0, timeMs - frameMs * share * 2);
    const past = evaluateWithLayout(scene, t);
    const moving = new Set<string>();
    for (const f of past.frame.elements) {
      const n = now.get(f.id);
      if (n && f.visible && n.visible && f.type !== "connector" && Math.hypot(n.x - f.x, n.y - f.y) > 3) moving.add(f.id);
    }
    if (moving.size === 0) return;
    const skip = new Set(frame.elements.map((f) => f.id).filter((id) => !moving.has(id)));
    // No captions, transitions, or particles in the faint copies.
    const ghost: FrameState = { timeMs: t, camera: frame.camera, particles: [], elements: past.frame.elements.map((f) => (moving.has(f.id) ? { ...f, opacity: f.opacity * alpha } : f)) };
    renderFrame(ctx, scene, ghost, past.routes, { ...opts, noBackground: true, skipIds: skip });
  }
}

/** Evaluate and draw the scene at `timeMs`. */
export function renderScene(ctx: Ctx2D, scene: Scene, timeMs: number, opts: RenderOptions): FrameState {
  const { frame, routes } = evaluateWithLayout(scene, timeMs);
  renderFrame(ctx, scene, frame, routes, opts);
  if (scene.settings.motionBlur && timeMs > 0) drawMotionBlur(ctx, scene, frame, timeMs, opts);
  drawCaption(ctx, scene, timeMs, opts);
  return frame;
}
