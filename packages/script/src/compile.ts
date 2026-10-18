import { type LayoutKind, autoLayout } from "@anivo/layout";
import type { OperationInput } from "@anivo/ops";
import type { Scene } from "@anivo/schema";
import { type Line, type Pos, type ScriptError, type Token, parseLines } from "./syntax.js";

/** Result of a compile: operations for the operation bus, or errors. */
export type CompileResult = { ok: true; ops: OperationInput[]; replace: boolean } | { ok: false; errors: ScriptError[] };

export interface CompileOptions {
  /**
   * `replace` (default): the script is the full scene; the caller starts from an empty scene.
   * `append`: the script adds elements and steps to `base`.
   */
  mode?: "replace" | "append";
  base?: Scene;
}

const ELEMENT_KINDS = new Set(["box", "ellipse", "diamond", "text", "icon", "caption", "row", "column", "grid", "group", "line", "code", "image", "table"]);
const CONTAINERS = new Set(["row", "column", "grid", "group"]);
const ENTER_EFFECTS = new Set(["fade", "pop", "scale", "slide", "draw-on", "wipe", "typewriter"]);
const EMPHASIS = new Set(["pulse", "shake", "wiggle", "glow", "flash", "highlight", "focus"]);
const ACTIONS = new Set(["enter", "exit", "morph", "flow", "wait", "camera", "count", "code", "move", ...EMPHASIS]);

const DEFAULT_SIZE: Record<string, [number, number]> = {
  box: [220, 90],
  ellipse: [180, 110],
  diamond: [180, 130],
  icon: [120, 120],
  line: [200, 20],
  image: [320, 240],
};

/** IDs of the cells of the declared tables: <table>-r<row>c<col>. */
function tableCells(decls: Map<string, ElemDecl>): string[] {
  const out: string[] = [];
  for (const d of decls.values()) {
    if (d.kind !== "table" || !d.cells) continue;
    const cols = Math.max(1, ...d.cells.map((r) => r.length));
    d.cells.forEach((_, r) => {
      for (let c = 1; c <= cols; c++) out.push(`${d.id}-r${r + 1}c${c}`);
    });
  }
  return out;
}

interface ElemDecl {
  /** Position of the statement in the script, for the draw order. */
  order: number;
  pos: Pos;
  kind: string;
  id: string;
  label?: string;
  icon?: { pack: string; name: string };
  flags: Set<string>;
  kv: Map<string, { v: string; quoted: boolean; pos: Pos }>;
  children: ElemDecl[];
  /** Table rows of cell texts. */
  cells?: string[][];
  // Layout results
  w: number;
  h: number;
  x?: number;
  y?: number;
}

interface ArrowDecl {
  order: number;
  pos: Pos;
  parentId?: string;
  from: End;
  to: End[];
  label?: string;
  flags: Set<string>;
  kv: Map<string, { v: string; quoted: boolean; pos: Pos }>;
}
type End = { kind: "id"; id: string } | { kind: "point"; x: number; y: number };

const err = (pos: Pos, message: string, hint?: string): ScriptError => ({ ...pos, message, ...(hint ? { hint } : {}) });

/** Parse a time: 300ms, 1.5s, or a number of milliseconds. */
export function parseTime(v: string): number | undefined {
  const m = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Math.round(m[2] === "s" ? n * 1000 : n);
}

function parseSize(v: string): [number, number] | undefined {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

function parsePoint(v: string): [number, number] | undefined {
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

const num = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined);

/** Style keys in Anivo Script and their schema names. */
const STYLE_KEYS: Record<string, string> = {
  fill: "fill",
  stroke: "stroke",
  "stroke-width": "strokeWidth",
  strokeWidth: "strokeWidth",
  width: "strokeWidth", // only for arrows; boxes use size=
  radius: "cornerRadius",
  cornerRadius: "cornerRadius",
  "font-size": "fontSize",
  fontSize: "fontSize",
  color: "textColor",
  textColor: "textColor",
  "text-align": "textAlign",
  font: "fontFamily",
  roughness: "roughness",
};

export function compile(text: string, opts: CompileOptions = {}): CompileResult {
  const { lines, errors } = parseLines(text);
  const mode = opts.mode ?? "replace";
  const ops: OperationInput[] = [];
  const elements: ElemDecl[] = [];
  const arrows: ArrowDecl[] = [];
  const stepLines: Line[] = [];
  const layoutLines: Line[] = [];
  const declared = new Map<string, ElemDecl>();
  const existing = new Set(mode === "append" && opts.base ? Object.keys(opts.base.elements) : []);
  let camera = { x: 0, y: 0, width: opts.base?.settings.video.width ?? 1920, height: opts.base?.settings.video.height ?? 1080 };

  const readProps = (tokens: Token[], from: number) => {
    const flags = new Set<string>();
    const kv = new Map<string, { v: string; quoted: boolean; pos: Pos }>();
    const strings: { v: string; pos: Pos }[] = [];
    const words: { v: string; pos: Pos }[] = [];
    for (let i = from; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.t === "kv") kv.set(t.k, { v: t.v, quoted: t.quoted, pos: t.pos });
      else if (t.t === "string") strings.push({ v: t.v, pos: t.pos });
      else if (t.t === "word") words.push({ v: t.v, pos: t.pos });
    }
    for (const w of words) flags.add(w.v);
    return { flags, kv, strings, words };
  };

  // --- pass 1: declarations -------------------------------------------------------------
  const readElement = (line: Line, parent?: ElemDecl): ElemDecl | undefined => {
    const [head, idTok] = line.tokens as [Token, Token | undefined];
    const kind = (head as { v: string }).v;
    if (!idTok || idTok.t !== "word") {
      errors.push(err(line.pos, `The ${kind} has no ID.`, `Write: ${kind} my-id "Label"`));
      return undefined;
    }
    const id = idTok.v;
    if (!/^[a-z][a-z0-9-]{0,47}$/.test(id)) {
      errors.push(err(idTok.pos, `The ID '${id}' is not valid.`, "Use lower-case letters, digits, and '-'. Start with a letter. Maximum 48 characters."));
      return undefined;
    }
    if (declared.has(id) || existing.has(id)) {
      errors.push(err(idTok.pos, `The ID '${id}' is used two times.`, "Each element ID must be unique."));
      return undefined;
    }
    let rest = 2;
    let icon: ElemDecl["icon"];
    if (kind === "icon") {
      const ref = line.tokens[2];
      const m = ref && ref.t === "word" ? /^([a-z0-9-]+):([a-z0-9-]+)$/.exec(ref.v) : null;
      if (!m) {
        errors.push(err(ref?.pos ?? line.pos, "The icon needs a pack and a name.", "Write: icon db lucide:database \"Database\". Call anivo_icons_search to find names."));
        return undefined;
      }
      icon = { pack: m[1]!, name: m[2]! };
      rest = 3;
    }
    const p = readProps(line.tokens, rest);
    const decl: ElemDecl = { order: line.pos.line, pos: line.pos, kind, id, flags: p.flags, kv: p.kv, children: [], w: 0, h: 0 };
    if (p.strings[0]) decl.label = p.strings[0].v;
    if (icon) decl.icon = icon;
    declared.set(id, decl);
    if (CONTAINERS.has(kind)) {
      for (const c of line.children) {
        const head2 = c.tokens[0];
        if (head2?.t === "word" && ELEMENT_KINDS.has(head2.v)) {
          const child = readElement(c, decl);
          if (child) decl.children.push(child);
        } else if (head2?.t === "word" && head2.v === "arrow" && kind === "group") {
          const a = readArrow(c, errors);
          if (a) arrows.push({ ...a, parentId: id });
        } else errors.push(err(c.pos, `A ${kind} can contain elements only.`, "Write elements such as: box pod-1 \"pod-1\""));
      }
    } else if (kind === "table") {
      // Each child line is one row of cells: "a" "b" "c".
      decl.cells = [];
      for (const c of line.children) {
        if (c.tokens.length === 0 || c.tokens.some((t) => t.t !== "string")) {
          errors.push(err(c.pos, "A table row must contain cell texts only.", 'Write each row as strings: "id" "name" "email"'));
          continue;
        }
        decl.cells.push(c.tokens.map((t) => (t as { v: string }).v));
      }
      if (decl.cells.length === 0) errors.push(err(line.pos, "The table has no rows.", 'Write the rows under the table, one line each: "id" "name"'));
    } else if (line.children.length > 0) {
      errors.push(err(line.children[0]!.pos, `A ${kind} cannot have child lines.`, "Remove the indent, or use row, column, grid, or group."));
    }
    void parent;
    return decl;
  };

  for (const line of lines) {
    const head = line.tokens[0]!;
    if (head.t !== "word") {
      errors.push(err(line.pos, "A line must start with a statement word.", "Examples: scene, box, arrow, step."));
      continue;
    }
    if (head.v === "scene") {
      if (mode === "append") {
        errors.push(err(line.pos, "Append mode cannot change the scene settings.", "Remove the scene line, or use replace mode."));
        continue;
      }
      const p = readProps(line.tokens, 1);
      const set: Record<string, unknown> = {};
      const style = p.kv.get("style")?.v;
      if (style) set["style"] = style;
      const theme = p.kv.get("theme")?.v;
      if (theme) set["theme"] = theme;
      const video: Record<string, number> = {};
      const sz = p.kv.get("size");
      if (sz) {
        const s = parseSize(sz.v);
        if (!s) errors.push(err(sz.pos, `The size '${sz.v}' is not valid.`, "Write: size=1920x1080"));
        else [video["width"], video["height"]] = s;
      }
      const fps = p.kv.get("fps");
      if (fps) video["fps"] = Number(fps.v);
      if (Object.keys(video).length) set["video"] = video;
      const bg = p.kv.get("background")?.v;
      if (bg) set["background"] = { kind: bg };
      if (Object.keys(set).length) ops.push({ op: "scene.settings", set });
      if (p.strings[0]) ops.push({ op: "scene.meta", set: { title: p.strings[0].v } });
      if (video["width"] && video["height"]) camera = { x: 0, y: 0, width: video["width"], height: video["height"] };
    } else if (ELEMENT_KINDS.has(head.v)) {
      const d = readElement(line);
      if (d) elements.push(d);
    } else if (head.v === "arrow") {
      const a = readArrow(line, errors);
      if (a) arrows.push(a);
    } else if (head.v === "step") {
      stepLines.push(line);
    } else if (head.v === "layout") {
      layoutLines.push(line);
    } else {
      errors.push(err(head.pos, `The statement '${head.v}' is not known.`, "Use: scene, box, ellipse, diamond, text, icon, caption, row, column, grid, group, arrow, layout, step."));
    }
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 20) };

  // --- pass 2: sizes and layout ---------------------------------------------------------
  const sizeOf = (d: ElemDecl) => {
    const size = d.kv.get("size")?.v;
    if (CONTAINERS.has(d.kind)) {
      d.children.forEach(sizeOf);
      const gap = num(d.kv.get("spacing")?.v ?? d.kv.get("gap")?.v ?? "") ?? (d.kind === "grid" ? 60 : 60);
      if (d.kind === "row") {
        d.w = d.children.reduce((s, c) => s + c.w, 0) + gap * Math.max(0, d.children.length - 1);
        d.h = Math.max(0, ...d.children.map((c) => c.h));
      } else if (d.kind === "column") {
        d.w = Math.max(0, ...d.children.map((c) => c.w));
        d.h = d.children.reduce((s, c) => s + c.h, 0) + gap * Math.max(0, d.children.length - 1);
      } else if (d.kind === "grid") {
        const cols = num(d.kv.get("cols")?.v ?? "") ?? Math.ceil(Math.sqrt(d.children.length));
        const cw = Math.max(0, ...d.children.map((c) => c.w));
        const ch = Math.max(0, ...d.children.map((c) => c.h));
        const rows = Math.ceil(d.children.length / cols);
        d.w = cols * cw + gap * (cols - 1);
        d.h = rows * ch + gap * (rows - 1);
      } else {
        // group: children keep their own positions (at=).
        d.w = 0;
        d.h = 0;
      }
      return;
    }
    const fontSize = num(d.kv.get("font-size")?.v ?? d.kv.get("fontSize")?.v ?? "") ?? (d.kind === "caption" ? 40 : 32);
    let [w, h] = DEFAULT_SIZE[d.kind] ?? [0, 0];
    const text = d.label ?? "";
    const longest = Math.max(1, ...text.split("\n").map((l) => l.length));
    // Approximate text width: 0.56 em for each character (Inter and Kalam are close to this).
    const textWidth = Math.round(longest * fontSize * 0.56);
    if (d.kind === "caption") {
      // A caption can change its text with a morph, so it takes the camera width.
      w = Math.min(1600, camera.width - 240);
      h = Math.round(fontSize * 1.6 * Math.max(1, text.split("\n").length));
    } else if (d.kind === "table") {
      const rows = d.cells?.length ?? 1;
      const cols = Math.max(1, ...(d.cells ?? [[""]]).map((r) => r.length));
      const longestCell = Math.max(4, ...(d.cells ?? []).flat().map((c) => c.length));
      w = Math.min(1700, cols * Math.max(160, Math.round(longestCell * 24 * 0.56 + 40)));
      h = rows * 64;
    } else if (d.kind === "code") {
      const lines = text.split("\n");
      const fs = num(d.kv.get("font-size")?.v ?? "") ?? 24;
      const longestLine = Math.max(1, ...lines.map((l) => l.length));
      w = Math.min(1700, Math.round(longestLine * fs * 0.62 + fs * 2 + fs * 2.5));
      h = Math.round(lines.length * fs * 1.5 + fs * 2);
    } else if (d.kind === "text") {
      w = Math.min(1200, Math.max(120, textWidth + 24));
      h = Math.round(fontSize * 1.6 * Math.max(1, text.split("\n").length));
    } else if (d.kind === "box" || d.kind === "ellipse" || d.kind === "diamond") {
      // Make the shape wide enough for its label on one line (up to 600 px).
      const pad = d.kind === "box" ? 56 : d.kind === "ellipse" ? 90 : 140;
      w = Math.min(600, Math.max(w, textWidth + pad));
    }
    if (size) {
      const s = parseSize(size);
      if (s) [w, h] = s;
    }
    d.w = w;
    d.h = h;
  };
  elements.forEach(sizeOf);

  const placeChildren = (d: ElemDecl) => {
    if (!CONTAINERS.has(d.kind) || d.x === undefined || d.y === undefined) return;
    const gap = num(d.kv.get("spacing")?.v ?? d.kv.get("gap")?.v ?? "") ?? 60;
    let cursor = 0;
    if (d.kind === "grid") {
      const cols = num(d.kv.get("cols")?.v ?? "") ?? Math.ceil(Math.sqrt(d.children.length));
      const cw = Math.max(...d.children.map((c) => c.w));
      const ch = Math.max(...d.children.map((c) => c.h));
      d.children.forEach((c, i) => {
        c.x = d.x! + (i % cols) * (cw + gap) + (cw - c.w) / 2;
        c.y = d.y! + Math.floor(i / cols) * (ch + gap) + (ch - c.h) / 2;
      });
    } else {
      for (const c of d.children) {
        if (d.kind === "row") {
          c.x = d.x + cursor;
          c.y = d.y + (d.h - c.h) / 2;
          cursor += c.w + gap;
        } else if (d.kind === "column") {
          c.x = d.x + (d.w - c.w) / 2;
          c.y = d.y + cursor;
          cursor += c.h + gap;
        }
      }
    }
    d.children.forEach((c) => {
      if (d.kind === "group") placeAbsolute(c);
      placeChildren(c);
    });
  };

  const placeAbsolute = (d: ElemDecl) => {
    const at = d.kv.get("at");
    if (at) {
      const p = parsePoint(at.v);
      if (!p) errors.push(err(at.pos, `The position '${at.v}' is not valid.`, "Write: at=600,490"));
      else [d.x, d.y] = p;
    }
  };

  // layout statements: place top-level elements with the automatic layout (FR-CANVAS-16).
  for (const line of layoutLines) {
    const words = line.tokens.slice(1).filter((t): t is Extract<Token, { t: "word" }> => t.t === "word");
    const kinds = ["row", "column", "grid", "tree", "layered"];
    const kindTok = words.find((w) => kinds.includes(w.v));
    if (!kindTok) {
      errors.push(err(line.pos, "The layout has no kind.", "Write: layout web, api, db layered"));
      continue;
    }
    const ids = words.filter((w) => w !== kindTok).map((w) => w.v);
    const decls = ids.map((id) => ({ id, d: elements.find((e) => e.id === id) }));
    const missing = decls.find((x) => !x.d);
    if (missing) {
      errors.push(err(line.pos, `The layout uses '${missing.id}', which is not a top-level element.`, "Use the IDs of elements that are not inside a row, column, grid, or group."));
      continue;
    }
    const kv = new Map(line.tokens.filter((t): t is Extract<Token, { t: "kv" }> => t.t === "kv").map((t) => [t.k, t.v]));
    const set = new Set(ids);
    const edges = arrows.flatMap((a) => (a.from.kind === "id" && set.has(a.from.id) ? a.to.flatMap((t) => (t.kind === "id" && set.has(t.id) ? [{ from: (a.from as { id: string }).id, to: t.id }] : [])) : []));
    const gap = num(kv.get("gap") ?? "");
    const cols = num(kv.get("cols") ?? "");
    const direction = kv.get("direction");
    const result = autoLayout(
      decls.map((x) => ({ id: x.id, width: x.d!.w, height: x.d!.h })),
      edges,
      { kind: kindTok.v as LayoutKind, ...(gap !== undefined ? { gap } : {}), ...(cols !== undefined ? { cols } : {}), ...(direction === "right" || direction === "down" ? { direction } : {}) },
    );
    for (const x of decls) {
      const p = result.get(x.id)!;
      x.d!.x = p.x;
      x.d!.y = p.y;
      x.d!.kv.delete("at");
    }
  }

  // Relative placement and auto placement for top-level elements, in dependency order.
  const RELATIONS = ["right-of", "left-of", "above", "below"] as const;
  const hasAt = (e: ElemDecl): boolean => e.kv.has("at") || e.children.some(hasAt);
  const anyAbsolute = elements.some(hasAt);
  const placing = new Set<string>();
  let autoCursor: ElemDecl | undefined;
  const allDecls = new Map<string, ElemDecl>();
  const collect = (d: ElemDecl) => {
    allDecls.set(d.id, d);
    d.children.forEach(collect);
  };
  elements.forEach(collect);

  const place = (d: ElemDecl): boolean => {
    if (d.x !== undefined) return true;
    if (placing.has(d.id)) {
      errors.push(err(d.pos, `The placement of '${d.id}' depends on itself.`, "Remove the circle in right-of, left-of, above, and below."));
      return false;
    }
    placing.add(d.id);
    placeAbsolute(d);
    if (d.x === undefined) {
      const rel = RELATIONS.find((r) => d.kv.has(r));
      if (rel) {
        const refId = d.kv.get(rel)!.v;
        const ref = allDecls.get(refId);
        const base = ref ?? (opts.base ? baseBox(opts.base, refId) : undefined);
        if (!base) {
          errors.push(err(d.kv.get(rel)!.pos, `The element '${refId}' does not exist.`, `Declare '${refId}' in the script, or use one of: ${[...allDecls.keys()].slice(0, 12).join(", ")}.`));
          return false;
        }
        if (ref && !place(ref)) return false;
        const b: { x: number; y: number; w: number; h: number } = ref ? { x: ref.x!, y: ref.y!, w: ref.w, h: ref.h } : (base as { x: number; y: number; w: number; h: number });
        const gap = num(d.kv.get("gap")?.v ?? "") ?? 160;
        const align = d.kv.get("align")?.v ?? "center";
        const across = (start: number, size: number, own: number) => (align === "start" ? start : align === "end" ? start + size - own : start + (size - own) / 2);
        if (rel === "right-of") [d.x, d.y] = [b.x + b.w + gap, across(b.y, b.h, d.h)];
        if (rel === "left-of") [d.x, d.y] = [b.x - gap - d.w, across(b.y, b.h, d.h)];
        if (rel === "below") [d.x, d.y] = [across(b.x, b.w, d.w), b.y + b.h + gap];
        if (rel === "above") [d.x, d.y] = [across(b.x, b.w, d.w), b.y - gap - d.h];
      } else if (d.kind === "caption") {
        const top = d.flags.has("top");
        d.x = camera.x + (camera.width - d.w) / 2;
        d.y = top ? camera.y + 60 : camera.y + camera.height - 60 - d.h;
      } else {
        // Auto placement: to the right of the previous auto-placed element.
        const prev = autoCursor;
        d.x = prev ? prev.x! + prev.w + 160 : camera.x + 120;
        d.y = camera.y + camera.height / 2 - d.h / 2;
        autoCursor = d;
      }
    }
    placeChildren(d);
    return true;
  };
  for (const d of elements) if (!place(d)) break;
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 20) };

  // With no absolute positions, center the diagram in the camera (captions stay where they are).
  if (!anyAbsolute && mode === "replace") {
    const tops = elements.filter((e) => e.kind !== "caption");
    const boxes = [...tops].flatMap((e) => (e.kind === "group" ? e.children : [e]));
    if (boxes.length > 0) {
      const minX = Math.min(...boxes.map((b) => b.x!));
      const maxX = Math.max(...boxes.map((b) => b.x! + b.w));
      const minY = Math.min(...boxes.map((b) => b.y!));
      const maxY = Math.max(...boxes.map((b) => b.y! + b.h));
      const dx = camera.x + (camera.width - (maxX - minX)) / 2 - minX;
      const dy = camera.y + (camera.height - (maxY - minY)) / 2 - minY;
      const shift = (d: ElemDecl) => {
        d.x = d.x! + dx;
        d.y = d.y! + dy;
        d.children.forEach(shift);
      };
      tops.forEach(shift);
    }
  }

  // --- pass 3: operations for elements --------------------------------------------------
  // Shapes and arrows keep the order of the script, which is the draw order.
  const ordered: { order: number; op: OperationInput }[] = [];
  const settingsOps = ops.splice(0, ops.length);
  const elementOps = (d: ElemDecl, parentId?: string) => {
    const push = (op: OperationInput) => ordered.push({ order: d.order, op });
    if (CONTAINERS.has(d.kind)) {
      push({ op: "element.add", id: d.id, type: "group", props: {} });
      for (const c of d.children) elementOps(c, d.id);
      return;
    }
    const style: Record<string, unknown> = {};
    const props: Record<string, unknown> = { x: round(d.x!), y: round(d.y!), width: round(d.w), height: round(d.h) };
    if (parentId) props["parentId"] = parentId;
    for (const [k, { v, pos }] of d.kv) {
      if (["at", "size", "gap", "align", "spacing", "cols", "id", "lang", ...(d.kind === "image" ? ["asset", "fit"] : []), ...RELATIONS].includes(k)) {
        continue;
      }
      if (k === "opacity") props["opacity"] = Number(v);
      else if (k === "rotate" || k === "rotation") props["rotation"] = Number(v);
      else if (k === "style" && ["solid", "dashed", "dotted"].includes(v)) style["strokeStyle"] = v;
      else if (k === "weight") style["fontWeight"] = Number(v);
      else if (STYLE_KEYS[k]) style[STYLE_KEYS[k]] = num(v) ?? v;
      else errors.push(err(pos, `The property '${k}' is not known for ${d.kind}.`, "Use: at, size, fill, stroke, stroke-width, style, radius, font-size, color, text-align, opacity, rotate, weight."));
    }
    if (d.flags.has("dashed")) style["strokeStyle"] = "dashed";
    if (d.flags.has("dotted")) style["strokeStyle"] = "dotted";
    if (d.flags.has("bold")) style["fontWeight"] = 700;
    if (Object.keys(style).length) props["style"] = style;
    let type = d.kind === "box" ? "rectangle" : d.kind;
    if (d.kind === "code") {
      props["code"] = d.label ?? "";
      const lang = d.kv.get("lang")?.v;
      if (lang) props["language"] = lang;
      if (d.flags.has("no-numbers")) props["lineNumbers"] = false;
    } else if (d.kind === "table") {
      props["cells"] = d.cells ?? [];
      if (d.flags.has("no-header")) props["header"] = false;
    } else if (d.kind === "image") {
      const asset = d.kv.get("asset");
      if (!asset) errors.push(err(d.pos, "The image has no asset.", "Write: image logo asset=0123456789abcdef. 'anivo image add' gives the asset ID."));
      else props["assetId"] = asset.v;
      const fit = d.kv.get("fit")?.v;
      if (fit) props["fit"] = fit;
    } else if (d.kind === "text" || d.kind === "caption") {
      type = "text";
      props["content"] = { text: d.label ?? "" };
      if (d.kind === "caption") props["style"] = { fontSize: 40, textColor: "muted", ...style };
    } else if (d.label !== undefined) props["label"] = d.label;
    if (d.icon) Object.assign(props, d.icon);
    push({ op: "element.add", id: d.id, type, props });
  };
  elements.forEach((d) => elementOps(d));

  // Connectors
  const connectorIds = new Map<string, string>();
  const allIds = () => new Set([...existing, ...allDecls.keys(), ...tableCells(allDecls)]);
  for (const a of arrows) {
    const ids = allIds();
    const checkEnd = (e: End, pos: Pos) => {
      if (e.kind === "id" && !ids.has(e.id)) errors.push(err(pos, `The element '${e.id}' does not exist.`, `Use one of: ${[...ids].slice(0, 12).join(", ")}.`));
    };
    checkEnd(a.from, a.pos);
    a.to.forEach((t) => checkEnd(t, a.pos));
    for (const to of a.to) {
      const style: Record<string, unknown> = {};
      const props: Record<string, unknown> = {};
      for (const [k, { v, pos }] of a.kv) {
        if (k === "id") continue;
        if (k === "head" || k === "end-head") props["endHead"] = v;
        else if (k === "start-head") props["startHead"] = v;
        else if (k === "route") props["route"] = v;
        else if (k === "label") props["label"] = v;
        else if (k === "opacity") props["opacity"] = Number(v);
        else if (k === "style") style["strokeStyle"] = v;
        else if (STYLE_KEYS[k]) style[STYLE_KEYS[k]] = num(v) ?? v;
        else errors.push(err(pos, `The property '${k}' is not known for arrow.`, "Use: id, label, head, start-head, route, stroke, width, style, opacity."));
      }
      if (a.label !== undefined) props["label"] = a.label;
      for (const f of a.flags) {
        if (["straight", "elbow", "curved"].includes(f)) props["route"] = f;
        else if (f === "dashed" || f === "dotted") style["strokeStyle"] = f;
        else if (f === "both") props["startHead"] = "arrow";
        else if (f === "no-head") props["endHead"] = "none";
      }
      if (Object.keys(style).length) props["style"] = style;
      if (a.parentId) props["parentId"] = a.parentId;
      const explicit = a.kv.get("id")?.v;
      const fromName = a.from.kind === "id" ? a.from.id : "p";
      const toName = to.kind === "id" ? to.id : "p";
      const id = explicit && a.to.length === 1 ? explicit : `c-${fromName}-${toName}`.slice(0, 48);
      if (a.from.kind === "id" && to.kind === "id") connectorIds.set(`${a.from.id}->${to.id}`, id);
      const endOf = (e: End) => (e.kind === "id" ? { kind: "bound", elementId: e.id } : { kind: "free", x: e.x, y: e.y });
      ordered.push({ order: a.order, op: { op: "element.add", id, type: "connector", props: { start: endOf(a.from), end: endOf(to), ...props } } });
      allDecls.set(id, { order: a.order, pos: a.pos, kind: "arrow", id, flags: new Set(), kv: new Map(), children: [], w: 0, h: 0 });
    }
  }
  if (opts.base) {
    for (const el of Object.values(opts.base.elements)) {
      if (el.type === "connector" && el.start.kind === "bound" && el.end.kind === "bound") connectorIds.set(`${el.start.elementId}->${el.end.elementId}`, el.id);
    }
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 20) };
  // A group comes before its elements, so a child can refer to its parent.
  ordered.sort((a, b) => a.order - b.order);
  ops.push(...settingsOps, ...ordered.map((o) => o.op));

  // --- pass 4: steps ------------------------------------------------------------------------
  const declOrder = [...existing, ...allDecls.keys(), ...tableCells(allDecls)];
  const resolveTargets = (t: Token[], pos: Pos): string[] => {
    const out: string[] = [];
    for (const tok of t) {
      if (tok.t !== "word") continue;
      const ref = tok.v;
      if (ref.includes("->")) {
        const [from, to] = ref.split("->") as [string, string];
        const matches = [...connectorIds.entries()].filter(([k]) => {
          const [f, tt] = k.split("->") as [string, string];
          return globMatch(from, f) && globMatch(to, tt);
        });
        if (matches.length === 0) errors.push(err(tok.pos, `No arrow goes from '${from}' to '${to}'.`, "Declare the arrow first: arrow a -> b"));
        out.push(...matches.map(([, id]) => id));
      } else if (ref.endsWith("*")) {
        const prefix = ref.slice(0, -1);
        const matches = declOrder.filter((id) => id.startsWith(prefix) && !id.startsWith("c-"));
        if (matches.length === 0) errors.push(err(tok.pos, `No element ID starts with '${prefix}'.`));
        out.push(...matches);
      } else {
        if (!declOrder.includes(ref)) errors.push(err(tok.pos, `The element '${ref}' does not exist.`, `Use one of: ${declOrder.slice(0, 12).join(", ")}.`));
        out.push(ref);
      }
    }
    if (out.length === 0) errors.push(err(pos, "The action has no target.", "Write the element IDs after the action word, for example: enter lb pop"));
    return [...new Set(out)];
  };

  stepLines.forEach((line) => {
    const p = readProps(line.tokens, 1);
    const props: Record<string, unknown> = { title: p.strings[0]?.v ?? "" };
    const hold = p.kv.get("hold");
    if (hold) props["holdMs"] = parseTime(hold.v) ?? errors.push(err(hold.pos, `The time '${hold.v}' is not valid.`, "Write: 300ms or 1.5s"));
    const dur = p.kv.get("dur");
    if (dur) props["durationMs"] = parseTime(dur.v);
    const notes = p.kv.get("notes");
    if (notes) props["notes"] = notes.v;
    if (p.flags.has("click")) props["trigger"] = { kind: "click" };
    const actions = line.children.map((c) => compileAction(c, resolveTargets, errors)).filter((a): a is Record<string, unknown> => a !== undefined);
    props["actions"] = actions;
    const id = p.kv.get("id")?.v;
    ops.push({ op: "step.add", ...(id ? { id } : {}), props });
  });

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 20) };
  return { ok: true, ops, replace: mode === "replace" };
}

const round = (n: number) => Math.round(n * 100) / 100;

function globMatch(pattern: string, value: string): boolean {
  return pattern.endsWith("*") ? value.startsWith(pattern.slice(0, -1)) : pattern === value;
}

function baseBox(scene: Scene, id: string): { x: number; y: number; w: number; h: number } | undefined {
  const el = scene.elements[id];
  return el ? { x: el.x, y: el.y, w: el.width, h: el.height } : undefined;
}

function readArrow(line: Line, errors: ScriptError[]): ArrowDecl | undefined {
  const t = line.tokens;
  const arrowAt = t.findIndex((x) => x.t === "arrow");
  // Also accept "a->b" as one word.
  let fromToks: Token[];
  let rest: Token[];
  if (arrowAt < 0) {
    const w = t[1];
    if (w?.t === "word" && w.v.includes("->")) {
      const [a, b] = w.v.split("->") as [string, string];
      fromToks = [{ t: "word", v: a, pos: w.pos }];
      rest = [{ t: "word", v: b, pos: w.pos }, ...t.slice(2)];
    } else {
      errors.push(err(line.pos, "The arrow has no '->'.", "Write: arrow user -> lb"));
      return undefined;
    }
  } else {
    fromToks = t.slice(1, arrowAt);
    rest = t.slice(arrowAt + 1);
  }
  const end = (toks: Token[]): End | undefined => {
    const words = toks.filter((x) => x.t === "word");
    if (words.length === 1 && toks.length === 1) return { kind: "id", id: (words[0] as { v: string }).v };
    // A point: x , y
    if (toks.length === 3 && toks[0]!.t === "word" && toks[1]!.t === "comma" && toks[2]!.t === "word") {
      const x = num((toks[0] as { v: string }).v);
      const y = num((toks[2] as { v: string }).v);
      if (x !== undefined && y !== undefined) return { kind: "point", x, y };
    }
    return undefined;
  };
  const from = end(fromToks);
  if (!from) {
    errors.push(err(line.pos, "The start of the arrow is not valid.", "Use an element ID or a point such as 340,300."));
    return undefined;
  }
  // Targets: words separated by commas; a point is "x,y" as word comma word with numbers.
  const to: End[] = [];
  const flags = new Set<string>();
  const kv = new Map<string, { v: string; quoted: boolean; pos: Pos }>();
  let label: string | undefined;
  let i = 0;
  let expectTarget = true;
  while (i < rest.length) {
    const x = rest[i]!;
    if (x.t === "kv") kv.set(x.k, { v: x.v, quoted: x.quoted, pos: x.pos });
    else if (x.t === "string") label = x.v;
    else if (x.t === "comma") expectTarget = true;
    else if (x.t === "word") {
      if (expectTarget) {
        const nx = num(x.v);
        const third = rest[i + 2];
        if (nx !== undefined && rest[i + 1]?.t === "comma" && third?.t === "word" && num(third.v) !== undefined) {
          to.push({ kind: "point", x: nx, y: num(third.v)! });
          i += 3;
          expectTarget = false;
          continue;
        }
        to.push({ kind: "id", id: x.v });
        expectTarget = false;
      } else flags.add(x.v);
    }
    i++;
  }
  if (to.length === 0) {
    errors.push(err(line.pos, "The arrow has no end.", "Write: arrow user -> lb"));
    return undefined;
  }
  const decl: ArrowDecl = { order: line.pos.line, pos: line.pos, from, to, flags, kv };
  if (label !== undefined) decl.label = label;
  return decl;
}

function compileAction(line: Line, resolveTargets: (t: Token[], pos: Pos) => string[], errors: ScriptError[]): Record<string, unknown> | undefined {
  const head = line.tokens[0];
  if (!head || head.t !== "word" || !ACTIONS.has(head.v)) {
    errors.push(err(line.pos, `The action '${head && "v" in head ? head.v : ""}' is not known.`, "Use: enter, exit, morph, flow, wait, camera, count, pulse, shake, wiggle, glow, flash, highlight, focus."));
    return undefined;
  }
  const verb = head.v;
  const words: Token[] = [];
  const kv = new Map<string, { v: string; pos: Pos }>();
  let delay: number | undefined;
  let effect: string | undefined;
  for (const t of line.tokens.slice(1)) {
    if (t.t === "kv") kv.set(t.k, { v: t.v, pos: t.pos });
    else if (t.t === "delay") {
      delay = parseTime(t.v);
      if (delay === undefined) errors.push(err(t.pos, `The delay '+${t.v}' is not valid.`, "Write: +300ms or +1s"));
    } else if (t.t === "word") {
      if ((verb === "enter" || verb === "exit") && ENTER_EFFECTS.has(t.v)) effect = t.v;
      else if (verb === "enter" && /^slide-(up|down|left|right)$/.test(t.v)) {
        effect = "slide";
        kv.set("direction", { v: t.v.slice(6), pos: t.pos });
      } else if (verb === "move" && (t.v === "curve" || t.v === "orient")) kv.set(t.v, { v: "true", pos: t.pos });
      else if (verb === "flow" && ["all", "round-robin", "random", "forward", "reverse", "both"].includes(t.v)) kv.set(["forward", "reverse", "both"].includes(t.v) ? "direction" : "distribute", { v: t.v === "random" ? "random-seeded" : t.v, pos: t.pos });
      else words.push(t);
    }
  }
  if (verb === "camera") {
    const op = words[0] && "v" in words[0] ? words[0].v : "";
    if (!["zoom-to", "pan", "reset"].includes(op)) {
      errors.push(err(line.pos, "The camera action needs zoom-to, pan, or reset.", "Write: camera zoom-to lb, pods  or  camera reset"));
      return undefined;
    }
    const a: Record<string, unknown> = { type: "camera", camera: { op } };
    if (delay !== undefined) a["delayMs"] = delay;
    const cam = a["camera"] as Record<string, unknown>;
    if (op === "zoom-to") {
      a["targets"] = resolveTargets(words.slice(1), line.pos);
    }
    for (const [k, { v, pos }] of kv) {
      if (k === "dur" || k === "duration") a["durationMs"] = parseTime(v);
      else if (k === "easing" || k === "ease") a["easing"] = v;
      else if (k === "id") a["id"] = v;
      else if (k === "padding") cam["padding"] = Number(v);
      else if (k === "at" || k === "size") continue;
      else errors.push(err(pos, `The property '${k}' is not known for camera.`, "Use: dur, easing, padding, at, size."));
    }
    if (op === "pan") {
      const at = kv.get("at")?.v.split(",").map(Number);
      const size = kv.get("size")?.v.split("x").map(Number);
      if (!at || !size || at.length !== 2 || size.length !== 2 || [...at, ...size].some((n) => !Number.isFinite(n))) {
        errors.push(err(line.pos, "camera pan needs at=x,y and size=WxH.", "Write: camera pan at=0,0 size=960x540"));
        return undefined;
      }
      cam["rect"] = { x: at[0], y: at[1], width: size[0], height: size[1] };
    }
    return a;
  }
  if (verb === "code") {
    const targets = resolveTargets(words, line.pos);
    const a: Record<string, unknown> = { type: "code", targets };
    if (delay !== undefined) a["delayMs"] = delay;
    const range = (v: string) => {
      const m = /^(\d+)(?:-(\d+))?$/.exec(v);
      return m ? [Number(m[1]), Number(m[2] ?? m[1])] : undefined;
    };
    for (const [k, { v, pos }] of kv) {
      if (k === "highlight") a["code"] = v === "none" ? { op: "highlight" } : { op: "highlight", lines: range(v) };
      else if (k === "type") a["code"] = { op: "type", lines: range(v) };
      else if (k === "diff") a["code"] = { op: "diff", newCode: v };
      else if (k === "dur" || k === "duration") a["durationMs"] = parseTime(v);
      else if (k === "easing") a["easing"] = v;
      else if (k === "id") a["id"] = v;
      else errors.push(err(pos, `The property '${k}' is not known for code.`, 'Use: highlight=3-5, highlight=none, type=2-4, diff="new code", dur.'));
      if ((k === "highlight" && v !== "none" && !range(v)) || (k === "type" && !range(v))) errors.push(err(pos, `The line range '${v}' is not valid.`, "Write: 3-5 or 4"));
    }
    if (!a["code"]) {
      errors.push(err(line.pos, "The code action needs highlight=, type=, or diff=.", "Write: code snippet highlight=3-5"));
      return undefined;
    }
    return a;
  }
  if (verb === "count") {
    const targets = resolveTargets(words, line.pos);
    const from = num(kv.get("from")?.v ?? "");
    const to = num(kv.get("to")?.v ?? "");
    if (from === undefined || to === undefined) {
      errors.push(err(line.pos, "The count needs from= and to=.", 'Write: count rps from=0 to=1200 format="{n} req/s"'));
      return undefined;
    }
    const counter: Record<string, unknown> = { from, to };
    const format = kv.get("format")?.v;
    if (format !== undefined) counter["format"] = format;
    const decimals = kv.get("decimals")?.v;
    if (decimals !== undefined) counter["decimals"] = Number(decimals);
    const a: Record<string, unknown> = { type: "counter", targets, counter };
    if (delay !== undefined) a["delayMs"] = delay;
    for (const [k, { v }] of kv) {
      if (k === "dur" || k === "duration") a["durationMs"] = parseTime(v);
      else if (k === "easing") a["easing"] = v;
      else if (k === "id") a["id"] = v;
    }
    return a;
  }
  if (verb === "wait") {
    const d = words[0] && "v" in words[0] ? parseTime(words[0].v) : undefined;
    if (d === undefined) {
      errors.push(err(line.pos, "The wait has no time.", "Write: wait 1s"));
      return undefined;
    }
    return { type: "wait", durationMs: d };
  }
  // In a morph, words are targets; key=value pairs are the new values.
  const targets = resolveTargets(words, line.pos);
  const a: Record<string, unknown> = { targets };
  if (delay !== undefined) a["delayMs"] = delay;
  const common = (k: string, v: string, pos: Pos): boolean => {
    if (k === "dur" || k === "duration") a["durationMs"] = parseTime(v) ?? errors.push(err(pos, `The time '${v}' is not valid.`, "Write: 300ms or 1.5s"));
    else if (k === "stagger") a["staggerMs"] = parseTime(v);
    else if (k === "easing" || k === "ease") a["easing"] = v;
    else if (k === "delay") a["delayMs"] = parseTime(v);
    else if (k === "id") a["id"] = v;
    else if (k === "sound") a["sound"] = v;
    else if (k === "sound-gain") a["soundGainDb"] = Number(v);
    else return false;
    return true;
  };
  if (verb === "enter" || verb === "exit") {
    a["type"] = verb;
    a["effect"] = effect ?? (verb === "enter" ? "fade" : "fade");
    const params: Record<string, unknown> = {};
    for (const [k, { v, pos }] of kv) {
      if (common(k, v, pos)) continue;
      if (k === "direction") params["direction"] = v;
      else if (k === "distance") params["distance"] = Number(v);
      else if (k === "scale" || k === "from-scale") params["fromScale"] = Number(v);
      else errors.push(err(pos, `The property '${k}' is not known for ${verb}.`, "Use: dur, stagger, easing, direction, distance, scale."));
    }
    if (Object.keys(params).length) a["params"] = params;
  } else if (verb === "morph") {
    a["type"] = "morph";
    const to: Record<string, unknown> = {};
    const MORPH: Record<string, string> = { x: "x", y: "y", width: "width", height: "height", fill: "fill", stroke: "stroke", "stroke-width": "strokeWidth", radius: "cornerRadius", opacity: "opacity", "font-size": "fontSize", color: "textColor", label: "label", rotate: "rotation" };
    for (const [k, { v, pos }] of kv) {
      if (common(k, v, pos)) continue;
      const key = MORPH[k];
      if (!key) {
        errors.push(err(pos, `The property '${k}' cannot morph.`, "Use: x, y, width, height, fill, stroke, stroke-width, radius, opacity, font-size, color, label, rotate."));
        continue;
      }
      to[key] = key === "label" || key === "fill" || key === "stroke" || key === "textColor" ? v : Number(v);
    }
    if (Object.keys(to).length === 0) errors.push(err(line.pos, "The morph changes nothing.", "Write: morph pod-3 fill=danger"));
    a["to"] = to;
  } else if (verb === "move") {
    a["type"] = "motion";
    const motion: Record<string, unknown> = {};
    for (const [k, { v, pos }] of kv) {
      if (common(k, v, pos)) continue;
      if (k === "path") {
        const pts = v.split(/[\s;]+/).filter(Boolean).map((p) => parsePoint(p));
        if (pts.length < 2 || pts.some((p) => !p)) errors.push(err(pos, "The path needs 2 or more points.", 'Write: move a path="100,200 400,200 400,600"'));
        else motion["points"] = pts.map((p) => ({ x: p![0], y: p![1] }));
      } else if (k === "curve" || k === "orient") motion[k] = true;
      else errors.push(err(pos, `The property '${k}' is not known for move.`, "Use: path, curve, orient, dur, easing, stagger."));
    }
    if (!motion["points"]) errors.push(err(line.pos, "The move has no path.", 'Write: move a path="100,200 400,200 400,600"'));
    a["motion"] = motion;
  } else if (verb === "flow") {
    a["type"] = "flow";
    const flow: Record<string, unknown> = {};
    for (const [k, { v, pos }] of kv) {
      if (common(k, v, pos)) continue;
      if (k === "rate" || k === "speed" || k === "size" || k === "trail") flow[k] = Number(v);
      else if (k === "color" || k === "shape" || k === "distribute" || k === "direction") flow[k] = v;
      else if (k === "chain") {
        const ids = resolveTargets([{ t: "word", v, pos }], pos);
        if (ids[0]) flow["chainFrom"] = ids[0];
      } else if (k === "skip") flow["skip"] = resolveTargets(v.split(",").map((x) => ({ t: "word", v: x, pos }) as Token), pos);
      else errors.push(err(pos, `The property '${k}' is not known for flow.`, "Use: rate, speed, size, color, shape, chain, skip, dur, round-robin, reverse."));
    }
    a["flow"] = flow;
  } else {
    a["type"] = "emphasis";
    a["effect"] = verb;
    const params: Record<string, unknown> = {};
    for (const [k, { v, pos }] of kv) {
      if (common(k, v, pos)) continue;
      if (["count", "scale", "amplitude", "degrees", "width"].includes(k)) params[k] = Number(v);
      else if (k === "color") params["color"] = v;
      else if (k === "dim") params["dimTo"] = Number(v);
      else errors.push(err(pos, `The property '${k}' is not known for ${verb}.`, "Use: dur, count, scale, color, dim."));
    }
    if (Object.keys(params).length) a["params"] = params;
  }
  return a;
}
