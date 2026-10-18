/**
 * Import an Excalidraw file (FR-FILE-05). Shapes, text, arrows, bindings,
 * groups, frames, and images convert. Free-hand drawings do not.
 * Pure and deterministic: the same file gives the same scene.
 */
import { OperationBus, type OperationInput } from "@anivo/ops";
import { type Scene, loadScene } from "@anivo/schema";

export interface ImportResult {
  scene: Scene;
  /** Bytes of the new assets (images), by asset ID. */
  assets: Map<string, Uint8Array>;
  /** Things that did not convert. */
  warnings: string[];
}

export class ImportError extends Error {}

interface ExEl {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  frameId?: string | null;
  containerId?: string | null;
  boundElements?: { id: string; type: string }[] | null;
  text?: string;
  originalText?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  points?: [number, number][];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  elbowed?: boolean;
  roundness?: { type: number } | null;
  fileId?: string | null;
  name?: string | null;
  isDeleted?: boolean;
}

/** The Excalidraw palette as theme tokens. Other colors stay as hex values. */
const STROKE_TOKENS: Record<string, string | null> = { "#1e1e1e": null, "#000000": null, "#e03131": "danger", "#2f9e44": "success", "#1971c2": "accent", "#f08c00": "warning", "#868e96": "muted" };
const FILL_TOKENS: Record<string, string | null> = { transparent: null, "#ffc9c9": "danger-soft", "#b2f2bb": "success-soft", "#a5d8ff": "accent-soft", "#ffec99": "warning-soft", "#ffffff": "surface" };

function hex(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c) ? c.toLowerCase() : undefined;
}

function color(c: string | undefined, table: Record<string, string | null>): string | undefined {
  if (c === undefined) return undefined;
  const key = c.toLowerCase();
  if (key in table) return table[key] ?? undefined;
  return hex(c);
}

function slug(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return /^[a-z]/.test(s) ? s : s ? `e-${s}` : "";
}

function dataUrl(url: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!m) return null;
  return { mime: m[1]!, bytes: Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0)) };
}

/** The same content ID as @anivo/fileio (64-bit FNV-1a). Repeated here to keep this package small. */
function contentId(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i]!, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ bytes[i]! ^ (i & 0xff), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function importExcalidraw(json: unknown, opts: { title?: string } = {}): ImportResult {
  const doc = json as { type?: string; elements?: ExEl[]; files?: Record<string, { dataURL?: string; mimeType?: string }>; appState?: { viewBackgroundColor?: string } };
  if (!doc || !Array.isArray(doc.elements)) throw new ImportError("The file is not an Excalidraw file. It has no 'elements' list.");
  const warnings: string[] = [];
  const els = doc.elements.filter((e) => !e.isDeleted);
  const byId = new Map(els.map((e) => [e.id, e]));

  // Readable, unique IDs: from the text or the frame name, else the type and a number.
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const count = new Map<string, number>();
  const take = (base: string): string => {
    let id = base.slice(0, 40);
    for (let n = 2; used.has(id); n++) id = `${base.slice(0, 36)}-${n}`;
    used.add(id);
    return id;
  };
  const labelOf = (e: ExEl): string | undefined => {
    const t = e.boundElements?.find((b) => b.type === "text");
    const te = t ? byId.get(t.id) : undefined;
    return te ? (te.originalText ?? te.text ?? "") : undefined;
  };
  const kind = (t: string) => (t === "rectangle" ? "box" : t === "arrow" || t === "line" ? "c" : t);
  const nextName = (t: string) => {
    const k = kind(t);
    const n = (count.get(k) ?? 0) + 1;
    count.set(k, n);
    return `${k}-${n}`;
  };
  for (const e of els) {
    if (e.type === "text" && e.containerId && byId.has(e.containerId)) continue;
    const text = e.type === "text" ? (e.originalText ?? e.text ?? "") : e.type === "frame" ? (e.name ?? "") : (labelOf(e) ?? "");
    ids.set(e.id, take(slug(text.split("\n")[0] ?? "") || nextName(e.type)));
  }

  const ops: OperationInput[] = [];
  const assets = new Map<string, Uint8Array>();
  let rough = 0;
  let shapes = 0;

  // Groups: Excalidraw lists the group IDs of an element from inside to outside.
  const groupIds = new Map<string, string>();
  const groupParent = new Map<string, string | undefined>();
  for (const e of els) {
    const gs = e.groupIds ?? [];
    gs.forEach((g, i) => {
      if (!groupIds.has(g)) groupIds.set(g, take(`group-${groupIds.size + 1}`));
      if (!groupParent.has(g)) groupParent.set(g, gs[i + 1]);
    });
  }
  // Outer groups first, so a parent exists before its children.
  const depth = (g: string): number => (groupParent.get(g) ? 1 + depth(groupParent.get(g)!) : 0);
  for (const g of [...groupIds.keys()].sort((a, b) => depth(a) - depth(b))) {
    const parent = groupParent.get(g);
    ops.push({ op: "element.add", id: groupIds.get(g)!, type: "group", props: parent ? { parentId: groupIds.get(parent)! } : {} });
  }
  // Frames become groups. An element in a group stays in its group; the outer group goes into the frame.
  for (const e of els) if (e.type === "frame" || e.type === "magicframe") ops.push({ op: "element.add", id: ids.get(e.id)!, type: "group", props: {} });

  const parentOf = (e: ExEl): string | undefined => {
    const g = e.groupIds?.[0];
    if (g) return groupIds.get(g);
    if (e.frameId && byId.has(e.frameId)) return ids.get(e.frameId);
    return undefined;
  };
  // The outer group of an element in a frame goes into the frame.
  for (const e of els) {
    const outer = e.groupIds?.[e.groupIds.length - 1];
    if (outer && e.frameId && byId.has(e.frameId) && !ops.some((o) => o.op === "element.update" && o.id === groupIds.get(outer))) {
      ops.push({ op: "element.update", id: groupIds.get(outer)!, set: { parentId: ids.get(e.frameId)! } });
    }
  }

  const style = (e: ExEl, withFill: boolean) => {
    const s: Record<string, unknown> = {};
    const stroke = color(e.strokeColor, STROKE_TOKENS);
    if (stroke) s["stroke"] = stroke;
    if (withFill) {
      const fill = color(e.backgroundColor, FILL_TOKENS);
      if (fill) s["fill"] = fill;
    }
    if (e.strokeWidth !== undefined) s["strokeWidth"] = Math.max(1, Math.round(e.strokeWidth * 1.5));
    if (e.strokeStyle && e.strokeStyle !== "solid") s["strokeStyle"] = e.strokeStyle;
    return s;
  };
  const common = (e: ExEl) => {
    const p: Record<string, unknown> = {};
    if (e.angle) p["rotation"] = Math.round(((e.angle * 180) / Math.PI) * 100) / 100;
    if (e.opacity !== undefined && e.opacity < 100) p["opacity"] = Math.max(0, e.opacity) / 100;
    const parent = parentOf(e);
    if (parent) p["parentId"] = parent;
    return p;
  };
  const box = (e: ExEl) => ({ x: Math.round(e.x), y: Math.round(e.y), width: Math.max(1, Math.round(Math.abs(e.width))), height: Math.max(1, Math.round(Math.abs(e.height))) });

  const connectors: ExEl[] = [];
  for (const e of els) {
    const id = ids.get(e.id);
    if (!id) continue;
    if (e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond") {
      shapes++;
      if ((e.roughness ?? 1) >= 1) rough++;
      const label = labelOf(e);
      const s = style(e, true);
      if (e.type === "rectangle" && !e.roundness) s["cornerRadius"] = 0;
      const te = e.boundElements?.find((b) => b.type === "text");
      const t = te ? byId.get(te.id) : undefined;
      if (t?.fontSize) s["fontSize"] = Math.round(t.fontSize * 1.25);
      ops.push({ op: "element.add", id, type: e.type, props: { ...box(e), ...common(e), ...(label ? { label } : {}), style: s } });
    } else if (e.type === "text") {
      const s: Record<string, unknown> = {};
      const c = color(e.strokeColor, STROKE_TOKENS);
      if (c) s["textColor"] = c;
      if (e.fontSize) s["fontSize"] = Math.round(e.fontSize * 1.25);
      if (e.textAlign && e.textAlign !== "left") s["textAlign"] = e.textAlign;
      const b = box(e);
      ops.push({ op: "element.add", id, type: "text", props: { ...b, width: Math.round(b.width * 1.3 + 8), height: Math.round(b.height * 1.25), ...common(e), content: e.originalText ?? e.text ?? "", autoSize: false, style: s } });
    } else if (e.type === "arrow" || e.type === "line") {
      connectors.push(e);
    } else if (e.type === "image") {
      const file = e.fileId ? doc.files?.[e.fileId] : undefined;
      const data = file?.dataURL ? dataUrl(file.dataURL) : null;
      if (!data || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(data.mime)) {
        warnings.push(`Image '${e.id}' has no file data, or its type is not PNG, JPEG, WebP, or SVG. It was skipped.`);
        continue;
      }
      const aid = contentId(data.bytes);
      if (!assets.has(aid)) {
        assets.set(aid, data.bytes);
        ops.push({ op: "asset.add", asset: { id: aid, mime: data.mime, bytes: data.bytes.length, name: `${id}.${data.mime.split(/[/+]/)[1]}` } });
      }
      ops.push({ op: "element.add", id, type: "image", props: { ...box(e), ...common(e), assetId: aid, fit: "fill" } });
    } else if (e.type !== "frame" && e.type !== "magicframe") {
      warnings.push(`'${e.type}' elements do not convert (element '${e.id}').`);
    }
  }

  for (const e of connectors) {
    const id = ids.get(e.id)!;
    const pts: [number, number][] = e.points?.length ? e.points : [[0, 0], [e.width, e.height]];
    const abs = pts.map(([px, py]) => ({ x: Math.round(e.x + px), y: Math.round(e.y + py) }));
    const end = (b: { elementId: string } | null | undefined, p: { x: number; y: number }) => {
      const target = b ? ids.get(b.elementId) : undefined;
      return target && byId.get(b!.elementId)?.type !== "text" ? { kind: "bound", elementId: target } : { kind: "free", x: p.x, y: p.y };
    };
    const head = (h: string | null | undefined) => (!h ? "none" : h === "dot" || h === "circle" || h === "circle_outline" ? "dot" : h === "bar" ? "bar" : h === "triangle" || h === "triangle_outline" ? "triangle" : "arrow");
    const label = labelOf(e);
    const props: Record<string, unknown> = {
      start: end(e.startBinding, abs[0]!),
      end: end(e.endBinding, abs[abs.length - 1]!),
      startHead: head(e.startArrowhead),
      endHead: e.type === "line" ? "none" : head(e.endArrowhead === undefined ? "arrow" : e.endArrowhead),
      route: e.elbowed ? "elbow" : e.roundness ? "curved" : "straight",
      ...common(e),
      style: style(e, false),
      ...(label ? { label } : {}),
    };
    if (abs.length > 2 && !e.elbowed) props["waypoints"] = abs.slice(1, -1);
    ops.push({ op: "element.add", id, type: "connector", props });
  }

  const empty = loadScene({ schemaVersion: 1, meta: { title: opts.title ?? "Imported from Excalidraw" } });
  if (!empty.ok) throw new Error("The empty scene is not valid.");
  const bus = new OperationBus(empty.scene);
  if (shapes > 0 && rough / shapes >= 0.5) ops.unshift({ op: "scene.settings", set: { style: "sketch" } });
  const r = bus.apply({ label: "Import Excalidraw", ops });
  if (!r.ok) throw new ImportError(`The Excalidraw file did not convert: ${r.error.message}`);
  // Fit the camera to the drawing, with a margin.
  const fit = fitCamera(bus.scene);
  if (fit) bus.apply({ label: "Fit camera", ops: [{ op: "scene.settings", set: { camera: fit } }] });
  return { scene: bus.scene, assets, warnings };
}

/** A 16:9 camera around all elements, with a margin of 80 px. */
export function fitCamera(scene: Scene): { x: number; y: number; width: number; height: number } | null {
  const boxes = Object.values(scene.elements).filter((e) => e.type !== "group" && e.type !== "connector");
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)) - 80;
  const y0 = Math.min(...boxes.map((b) => b.y)) - 80;
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)) + 80;
  const y1 = Math.max(...boxes.map((b) => b.y + b.height)) + 80;
  const v = scene.settings.video;
  const ratio = v.width / v.height;
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;
  return { x: Math.round((x0 + x1 - w) / 2), y: Math.round((y0 + y1 - h) / 2), width: Math.round(w), height: Math.round(h) };
}
