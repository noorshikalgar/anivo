/**
 * A Ctx2D that writes SVG (FR-EXPORT-13: SVG of the end state of each step).
 * The renderer draws into it as into a canvas. Paths are stored in output
 * coordinates; text keeps its transform. Pure: the host gives text measurement.
 */
import type { Ctx2D } from "./ctx.js";

type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];

const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

interface State {
  m: M;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  dash: number[];
  /** ID of the clip path, or null. */
  clip: string | null;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Color and its alpha for SVG attributes ("rgba(…)" works in SVG 2, but fill-opacity is safer). */
function paint(css: string): { color: string; alpha: number } {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css.trim());
  if (m) return { color: `rgb(${m[1]},${m[2]},${m[3]})`, alpha: m[4] === undefined ? 1 : Number(m[4]) };
  return { color: css, alpha: 1 };
}

export interface SvgContextOptions {
  width: number;
  height: number;
  /** Text width in pixels for a CSS font; the same measure as the canvas renderer. */
  measure: (font: string, text: string) => number;
  /** Data URL of an image that the renderer draws (image elements). Undefined: the image is skipped. */
  imageHref?: (image: unknown) => string | undefined;
}

export class SvgContext implements Ctx2D {
  private s: State = { m: IDENTITY, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt", lineJoin: "miter", globalAlpha: 1, font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", dash: [], clip: null };
  private stack: State[] = [];
  private path = "";
  private out: string[] = [];
  private defs: string[] = [];
  private nextId = 1;

  constructor(private readonly opts: SvgContextOptions) {}

  // --- state ---
  get fillStyle(): unknown { return this.s.fillStyle; }
  set fillStyle(v: unknown) { this.s.fillStyle = String(v); }
  get strokeStyle(): unknown { return this.s.strokeStyle; }
  set strokeStyle(v: unknown) { this.s.strokeStyle = String(v); }
  get lineWidth(): number { return this.s.lineWidth; }
  set lineWidth(v: number) { this.s.lineWidth = v; }
  get lineCap(): string { return this.s.lineCap; }
  set lineCap(v: string) { this.s.lineCap = v; }
  get lineJoin(): string { return this.s.lineJoin; }
  set lineJoin(v: string) { this.s.lineJoin = v; }
  get globalAlpha(): number { return this.s.globalAlpha; }
  set globalAlpha(v: number) { this.s.globalAlpha = v; }
  get font(): string { return this.s.font; }
  set font(v: string) { this.s.font = v; }
  get textAlign(): string { return this.s.textAlign; }
  set textAlign(v: string) { this.s.textAlign = v; }
  get textBaseline(): string { return this.s.textBaseline; }
  set textBaseline(v: string) { this.s.textBaseline = v; }

  save(): void { this.stack.push({ ...this.s, dash: [...this.s.dash] }); }
  restore(): void { this.s = this.stack.pop() ?? this.s; }
  translate(x: number, y: number): void { this.s.m = mul(this.s.m, [1, 0, 0, 1, x, y]); }
  rotate(a: number): void { const c = Math.cos(a), si = Math.sin(a); this.s.m = mul(this.s.m, [c, si, -si, c, 0, 0]); }
  scale(x: number, y: number): void { this.s.m = mul(this.s.m, [x, 0, 0, y, 0, 0]); }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.s.m = [a, b, c, d, e, f]; }
  setLineDash(seg: number[]): void { this.s.dash = [...seg]; }

  // --- paths (in output coordinates) ---
  private p(x: number, y: number): string {
    const m = this.s.m;
    return `${n(m[0] * x + m[2] * y + m[4])} ${n(m[1] * x + m[3] * y + m[5])}`;
  }
  /** The scale of the transform, for line widths and dashes. */
  private k(): number { const m = this.s.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); }

  beginPath(): void { this.path = ""; }
  closePath(): void { this.path += "Z"; }
  moveTo(x: number, y: number): void { this.path += `M${this.p(x, y)}`; }
  lineTo(x: number, y: number): void { this.path += `L${this.p(x, y)}`; }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void { this.path += `C${this.p(a, b)} ${this.p(c, d)} ${this.p(x, y)}`; }
  rect(x: number, y: number, w: number, h: number): void { this.path += `M${this.p(x, y)}L${this.p(x + w, y)}L${this.p(x + w, y + h)}L${this.p(x, y + h)}Z`; }
  arc(x: number, y: number, r: number, start: number, end: number): void {
    // As line segments: exact enough at video sizes, and it keeps the transform simple.
    const steps = Math.max(8, Math.ceil((Math.abs(end - start) * r * this.k()) / 4));
    for (let i = 0; i <= steps; i++) {
      const a = start + ((end - start) * i) / steps;
      this.path += `${i === 0 && !this.path ? "M" : "L"}${this.p(x + r * Math.cos(a), y + r * Math.sin(a))}`;
    }
  }

  private clipAttr(): string { return this.s.clip ? ` clip-path="url(#${this.s.clip})"` : ""; }

  fill(): void {
    if (!this.path) return;
    const { color, alpha } = paint(this.s.fillStyle);
    const o = alpha * this.s.globalAlpha;
    if (o <= 0) return;
    this.out.push(`<path d="${this.path}" fill="${esc(color)}"${o < 1 ? ` fill-opacity="${n(o)}"` : ""}${this.clipAttr()}/>`);
  }

  stroke(): void {
    if (!this.path) return;
    const { color, alpha } = paint(this.s.strokeStyle);
    const o = alpha * this.s.globalAlpha;
    if (o <= 0) return;
    const k = this.k();
    const dash = this.s.dash.length ? ` stroke-dasharray="${this.s.dash.map((d) => n(d * k)).join(" ")}"` : "";
    this.out.push(`<path d="${this.path}" fill="none" stroke="${esc(color)}" stroke-width="${n(this.s.lineWidth * k)}" stroke-linecap="${this.s.lineCap}" stroke-linejoin="${this.s.lineJoin}"${dash}${o < 1 ? ` stroke-opacity="${n(o)}"` : ""}${this.clipAttr()}/>`);
  }

  clip(): void {
    const id = `c${this.nextId++}`;
    // A clip inside a clip: the new clip path is itself clipped by the old one.
    this.defs.push(`<clipPath id="${id}"${this.s.clip ? ` clip-path="url(#${this.s.clip})"` : ""}><path d="${this.path}"/></clipPath>`);
    this.s.clip = id;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const keep = this.path;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.path = keep;
  }

  clearRect(): void {
    // The SVG starts empty; a clear of the full frame is not needed.
  }

  measureText(text: string): { width: number } {
    return { width: this.opts.measure(this.s.font, text) };
  }

  fillText(text: string, x: number, y: number): void {
    const { color, alpha } = paint(this.s.fillStyle);
    const o = alpha * this.s.globalAlpha;
    if (o <= 0 || !text) return;
    const m = this.s.m;
    const anchor = this.s.textAlign === "center" ? "middle" : this.s.textAlign === "right" || this.s.textAlign === "end" ? "end" : "start";
    const baseline = this.s.textBaseline === "middle" ? "central" : this.s.textBaseline === "top" ? "hanging" : this.s.textBaseline === "bottom" ? "text-after-edge" : "alphabetic";
    const f = /^(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/.exec(this.s.font.trim());
    const weight = f?.[1] ?? "400";
    const size = f?.[2] ?? "10";
    const family = (f?.[3] ?? "sans-serif").replace(/"/g, "'");
    this.out.push(
      `<text x="${n(x)}" y="${n(y)}" transform="matrix(${m.map(n).join(" ")})" font-family="${esc(family)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${esc(color)}"${o < 1 ? ` fill-opacity="${n(o)}"` : ""} xml:space="preserve"${this.clipAttr()}>${esc(text)}</text>`,
    );
  }

  drawImage(image: never, dx: number, dy: number, dw: number, dh: number): void {
    const href = this.opts.imageHref?.(image);
    if (!href) return;
    const m = this.s.m;
    this.out.push(`<image href="${esc(href)}" x="${n(dx)}" y="${n(dy)}" width="${n(dw)}" height="${n(dh)}" preserveAspectRatio="none" transform="matrix(${m.map(n).join(" ")})"${this.s.globalAlpha < 1 ? ` opacity="${n(this.s.globalAlpha)}"` : ""}${this.clipAttr()}/>`);
  }

  /** The SVG document. */
  toString(): string {
    const { width, height } = this.opts;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${this.defs.length ? `<defs>${this.defs.join("")}</defs>` : ""}${this.out.join("")}</svg>\n`;
  }
}
