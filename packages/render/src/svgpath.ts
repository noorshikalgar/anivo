import type { Point } from "@anivo/schema";

/** One subpath, flattened to points. */
export interface Subpath {
  points: Point[];
  closed: boolean;
}

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

/**
 * Split path data into commands and numbers. Arc flags are single digits and
 * can have no separator ("a1 1 0 011 1"), so the tokenizer tracks the argument
 * position of each arc command.
 */
function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  let i = 0;
  let cmd = "";
  let arg = 0;
  while (i < d.length) {
    const c = d[i]!;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      out.push(c);
      cmd = c;
      arg = 0;
      i++;
    } else if (/[\s,]/.test(c)) {
      i++;
    } else if ((cmd === "A" || cmd === "a") && (arg % 7 === 3 || arg % 7 === 4)) {
      if (c !== "0" && c !== "1") throw new Error(`The SVG arc flag at position ${i} is not 0 or 1.`);
      out.push(c === "1" ? 1 : 0);
      arg++;
      i++;
    } else {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(d);
      if (!m) throw new Error(`The SVG path has a character that is not valid at position ${i}: '${c}'.`);
      out.push(Number(m[0]));
      arg++;
      i = NUMBER.lastIndex;
    }
  }
  return out;
}

function cubic(out: Point[], p0: Point, p1: Point, p2: Point, p3: Point, segments: number): void {
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
}

/** SVG elliptical arc (endpoint form) to points. Based on the SVG implementation notes (F.6). */
function arc(out: Point[], p0: Point, rxIn: number, ryIn: number, angleDeg: number, large: boolean, sweep: boolean, p1: Point, segmentsPerQuarter: number): void {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (p0.x === p1.x && p0.y === p1.y)) {
    out.push(p1);
    return;
  }
  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p1.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p1.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dtheta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
  const n = Math.max(2, Math.ceil((Math.abs(dtheta) / (Math.PI / 2)) * segmentsPerQuarter));
  for (let i = 1; i <= n; i++) {
    const t = theta1 + (dtheta * i) / n;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  out[out.length - 1] = p1;
}

/**
 * Parse SVG path data and flatten it to subpaths of points. Supports all
 * commands (M L H V C S Q T A Z), in absolute and relative form.
 */
export function flattenSvgPath(d: string, segments = 8): Subpath[] {
  const tokens = tokenize(d);
  const subpaths: Subpath[] = [];
  let cur: Point[] = [];
  let pos: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastCtrl: Point | null = null;
  let lastCmd = "";
  let i = 0;
  let cmd = "";

  const num = () => {
    const v = tokens[i++];
    if (typeof v !== "number") throw new Error("The SVG path is missing a number.");
    return v;
  };
  const flush = (closed: boolean) => {
    if (cur.length > 1) subpaths.push({ points: cur, closed });
    cur = [];
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === "string") {
      cmd = t;
      i++;
    } else if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";
    else if (cmd === "" || cmd === "Z" || cmd === "z") throw new Error("The SVG path has a number with no command.");

    const rel = cmd === cmd.toLowerCase();
    const base = rel ? pos : { x: 0, y: 0 };
    const C = cmd.toUpperCase();
    switch (C) {
      case "M": {
        flush(false);
        pos = { x: base.x + num(), y: base.y + num() };
        start = pos;
        cur = [pos];
        lastCtrl = null;
        break;
      }
      case "L":
        pos = { x: base.x + num(), y: base.y + num() };
        cur.push(pos);
        lastCtrl = null;
        break;
      case "H":
        pos = { x: (rel ? pos.x : 0) + num(), y: pos.y };
        cur.push(pos);
        lastCtrl = null;
        break;
      case "V":
        pos = { x: pos.x, y: (rel ? pos.y : 0) + num() };
        cur.push(pos);
        lastCtrl = null;
        break;
      case "C": {
        const p1 = { x: base.x + num(), y: base.y + num() };
        const p2 = { x: base.x + num(), y: base.y + num() };
        const p3 = { x: base.x + num(), y: base.y + num() };
        cubic(cur, pos, p1, p2, p3, segments);
        lastCtrl = p2;
        pos = p3;
        break;
      }
      case "S": {
        const p1 = lastCtrl && /[CcSs]/.test(lastCmd) ? { x: 2 * pos.x - lastCtrl.x, y: 2 * pos.y - lastCtrl.y } : pos;
        const p2 = { x: base.x + num(), y: base.y + num() };
        const p3 = { x: base.x + num(), y: base.y + num() };
        cubic(cur, pos, p1, p2, p3, segments);
        lastCtrl = p2;
        pos = p3;
        break;
      }
      case "Q":
      case "T": {
        const q: Point =
          C === "Q"
            ? { x: base.x + num(), y: base.y + num() }
            : lastCtrl && /[QqTt]/.test(lastCmd)
              ? { x: 2 * pos.x - lastCtrl.x, y: 2 * pos.y - lastCtrl.y }
              : pos;
        const p3 = { x: base.x + num(), y: base.y + num() };
        const p1 = { x: pos.x + (2 / 3) * (q.x - pos.x), y: pos.y + (2 / 3) * (q.y - pos.y) };
        const p2 = { x: p3.x + (2 / 3) * (q.x - p3.x), y: p3.y + (2 / 3) * (q.y - p3.y) };
        cubic(cur, pos, p1, p2, p3, segments);
        lastCtrl = q;
        pos = p3;
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        const p = { x: base.x + num(), y: base.y + num() };
        arc(cur, pos, rx, ry, rot, large, sweep, p, Math.max(2, Math.round(segments / 2)));
        pos = p;
        lastCtrl = null;
        break;
      }
      case "Z":
        if (cur.length > 0) cur.push(start);
        flush(true);
        pos = start;
        cur = [pos];
        lastCtrl = null;
        break;
      default:
        throw new Error(`The SVG path command '${cmd}' is not supported.`);
    }
    lastCmd = cmd;
  }
  flush(false);
  return subpaths;
}
