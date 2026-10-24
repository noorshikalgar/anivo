/**
 * Import Mermaid text (FR-FILE-06): flowcharts and sequence diagrams.
 * A flowchart gets an automatic layered layout and one step for each layer.
 * A sequence diagram gets one step for each message. Pure and deterministic.
 */
import { autoLayout } from "@anivo/layout";
import { OperationBus, type OperationInput } from "@anivo/ops";
import { loadScene } from "@anivo/schema";
import { ImportError, type ImportResult, fitCamera } from "./excalidraw.js";

type Shape = "rectangle" | "ellipse" | "diamond";

interface FNode {
  key: string;
  text: string;
  shape: Shape;
  rounded: boolean;
  parent?: string;
}

interface FEdge {
  from: string;
  to: string;
  label?: string;
  dashed: boolean;
  thick: boolean;
  head: "arrow" | "none" | "dot" | "bar";
  both: boolean;
}

function slug(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return /^[a-z]/.test(s) ? s : s ? `n-${s}` : "";
}

/** Text in Mermaid: quotes removed, <br> as a new line, simple entities. */
function clean(t: string): string {
  return t
    .trim()
    .replace(/^"(.*)"$/s, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/#quot;/g, '"')
    .trim();
}

/** Lines without comments; a semicolon also ends a statement. */
function statements(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((l) => l.replace(/%%.*$/, "").split(/;\s*$|;(?=\s)/))
    .map((l) => l.trim())
    .filter(Boolean);
}

const SHAPES: [RegExp, Shape, boolean][] = [
  [/^\(\(\((.*?)\)\)\)/, "ellipse", false],
  [/^\(\((.*?)\)\)/, "ellipse", false],
  [/^\(\[(.*?)\]\)/, "rectangle", true],
  [/^\[\[(.*?)\]\]/, "rectangle", false],
  [/^\[\((.*?)\)\]/, "rectangle", true],
  [/^\{\{(.*?)\}\}/, "diamond", false],
  [/^\[\/(.*?)[/\\]\]/, "rectangle", false],
  [/^\[\\(.*?)[/\\]\]/, "rectangle", false],
  [/^\[(.*?)\]/, "rectangle", false],
  [/^\((.*?)\)/, "rectangle", true],
  [/^\{(.*?)\}/, "diamond", false],
  [/^>(.*?)\]/, "rectangle", false],
];

/** Edge operators, longest first. Groups: start head, body, end head. */
const EDGE = /^\s*(<|x|o)?(-{2,}|-\.+-|={2,}|~~~)(>|x|o)?\s*/;
const EDGE_TEXT = /^\s*(<|x|o)?(--|-\.|==)\s+(.+?)\s+(-{2,}|\.+-|={2,})(>|x|o)?\s*/;

export function importMermaid(text: string, opts: { title?: string; steps?: boolean } = {}): ImportResult {
  const lines = statements(text);
  const header = lines[0] ?? "";
  if (/^(flowchart|graph)\b/i.test(header)) return flowchart(lines, opts);
  if (/^sequenceDiagram\b/.test(header)) return sequence(lines, opts);
  throw new ImportError("Anivo imports Mermaid flowcharts and sequence diagrams only. The text must start with 'flowchart', 'graph', or 'sequenceDiagram'.");
}

function flowchart(lines: string[], opts: { title?: string; steps?: boolean }): ImportResult {
  const dir = /^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)/i.exec(lines[0]!)?.[1]?.toUpperCase() ?? "TD";
  const nodes = new Map<string, FNode>();
  const edges: FEdge[] = [];
  const groups: { key: string; title: string; parent?: string }[] = [];
  const stack: string[] = [];
  const warnings = new Set<string>();

  const node = (key: string, text?: string, shape?: Shape, rounded = false): string => {
    const n = nodes.get(key);
    if (!n) nodes.set(key, { key, text: text ?? key, shape: shape ?? "rectangle", rounded, ...(stack.length ? { parent: stack[stack.length - 1]! } : {}) });
    else if (text !== undefined) Object.assign(n, { text, shape: shape ?? n.shape, rounded });
    return key;
  };

  /** Read node references separated by '&' at the start of `s`. */
  const readNodes = (s: string): { keys: string[]; rest: string } | null => {
    const keys: string[] = [];
    let rest = s;
    for (;;) {
      const m = /^\s*([A-Za-z0-9_][\w.-]*?)(?=[\s[({>&;:]|-{2}|-\.|={2}|~~~|$)/.exec(rest);
      if (!m) return keys.length ? { keys, rest } : null;
      const key = m[1]!;
      rest = rest.slice(m[0].length);
      let shaped = false;
      for (const [re, shape, rounded] of SHAPES) {
        const sm = re.exec(rest);
        if (sm) {
          keys.push(node(key, clean(sm[1]!), shape, rounded));
          rest = rest.slice(sm[0].length);
          shaped = true;
          break;
        }
      }
      if (!shaped) keys.push(node(key));
      rest = rest.replace(/^:::\w+/, "");
      const amp = /^\s*&\s*/.exec(rest);
      if (!amp) return { keys, rest };
      rest = rest.slice(amp[0].length);
    }
  };

  for (const line of lines.slice(1)) {
    const sub = /^subgraph\s+(.+)$/.exec(line);
    if (sub) {
      const m = /^([\w-]+)\s*\[(.*)\]$/.exec(sub[1]!.trim());
      const key = m ? m[1]! : sub[1]!.trim();
      groups.push({ key, title: clean(m ? m[2]! : key), ...(stack.length ? { parent: stack[stack.length - 1]! } : {}) });
      stack.push(key);
      continue;
    }
    if (line === "end") {
      stack.pop();
      continue;
    }
    if (/^(classDef|class|style|linkStyle|click|direction)\b/.test(line)) {
      warnings.add(`Mermaid '${line.split(/\s/)[0]}' lines do not convert. Change the look in Anivo.`);
      continue;
    }
    let first = readNodes(line);
    if (!first) {
      warnings.add(`A line did not convert: ${line}`);
      continue;
    }
    let rest = first.rest;
    while (rest.trim()) {
      let label: string | undefined;
      let m = EDGE_TEXT.exec(rest);
      let startHead: string | undefined;
      let body: string;
      let endHead: string | undefined;
      if (m) {
        [, startHead, body, label, , endHead] = m as unknown as [string, string | undefined, string, string, string, string | undefined];
      } else {
        m = EDGE.exec(rest);
        if (!m) {
          warnings.add(`A line did not convert: ${line}`);
          break;
        }
        [, startHead, body, endHead] = m as unknown as [string, string | undefined, string, string | undefined];
      }
      rest = rest.slice(m[0].length);
      const pipe = /^\|([^|]*)\|\s*/.exec(rest);
      if (pipe) {
        label = pipe[1];
        rest = rest.slice(pipe[0].length);
      }
      const next = readNodes(rest);
      if (!next) {
        warnings.add(`An arrow has no target: ${line}`);
        break;
      }
      const headOf = (h: string | undefined) => (h === ">" || h === "<" ? "arrow" : h === "o" ? "dot" : h === "x" ? "bar" : "none");
      for (const from of first.keys) {
        for (const to of next.keys) {
          edges.push({ from, to, ...(label ? { label: clean(label) } : {}), dashed: body.includes("."), thick: body.startsWith("="), head: headOf(endHead) as FEdge["head"], both: !!startHead && !!endHead });
        }
      }
      if (body === "~~~") edges.splice(edges.length - first.keys.length * next.keys.length);
      first = next;
      rest = next.rest;
    }
  }
  if (nodes.size === 0) throw new ImportError("The flowchart has no nodes.");

  // IDs.
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const take = (base: string) => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  for (const g of groups) ids.set(`g:${g.key}`, take(slug(g.title) || slug(g.key) || "group"));
  for (const n of nodes.values()) ids.set(n.key, take(slug(n.key) || slug(n.text) || "node"));

  // Sizes and layout.
  const size = (n: FNode) => {
    const longest = Math.max(...n.text.split("\n").map((l) => l.length));
    const lines = n.text.split("\n").length;
    if (n.shape === "ellipse") return { width: Math.max(140, longest * 15 + 70), height: Math.max(110, lines * 40 + 50) };
    if (n.shape === "diamond") return { width: Math.max(180, longest * 16 + 120), height: Math.max(130, lines * 40 + 80) };
    return { width: Math.max(180, longest * 15 + 56), height: Math.max(90, lines * 40 + 40) };
  };
  const list = [...nodes.values()];
  const pos = autoLayout(
    list.map((n) => ({ id: n.key, ...size(n) })),
    edges.map((e) => ({ from: e.from, to: e.to })),
    { kind: "layered", direction: dir === "LR" || dir === "RL" ? "right" : "down", origin: { x: 0, y: 0 } },
  );
  // RL and BT: mirror the layout.
  if (dir === "RL" || dir === "BT") {
    const horizontal = dir === "RL";
    const max = Math.max(...list.map((n) => (horizontal ? pos.get(n.key)!.x + size(n).width : pos.get(n.key)!.y + size(n).height)));
    for (const n of list) {
      const p = pos.get(n.key)!;
      if (horizontal) p.x = max - p.x - size(n).width;
      else p.y = max - p.y - size(n).height;
    }
  }

  const ops: OperationInput[] = [];
  for (const g of groups) ops.push({ op: "element.add", id: ids.get(`g:${g.key}`)!, type: "group", props: g.parent ? { parentId: ids.get(`g:${g.parent}`)! } : {} });
  for (const n of list) {
    const p = pos.get(n.key)!;
    ops.push({
      op: "element.add",
      id: ids.get(n.key)!,
      type: n.shape,
      props: { ...p, ...size(n), label: n.text, ...(n.parent ? { parentId: ids.get(`g:${n.parent}`)! } : {}), ...(n.shape === "rectangle" && n.rounded ? { style: { cornerRadius: 40 } } : {}) },
    });
  }
  const connIds: string[] = [];
  edges.forEach((e, i) => {
    const id = take(`c-${ids.get(e.from)}-${ids.get(e.to)}`.slice(0, 44));
    connIds[i] = id;
    ops.push({
      op: "element.connect",
      id,
      from: ids.get(e.from)!,
      to: ids.get(e.to)!,
      props: { endHead: e.head, ...(e.both ? { startHead: "arrow" } : {}), ...(e.label ? { label: e.label } : {}), style: { ...(e.dashed ? { strokeStyle: "dashed" } : {}), ...(e.thick ? { strokeWidth: 4 } : {}) } },
    });
  });

  // One step for each layer: its nodes enter, then the arrows into them draw on.
  if (opts.steps !== false) {
    const horizontal = dir === "LR" || dir === "RL";
    const along = [...new Set(list.map((n) => Math.round(horizontal ? pos.get(n.key)!.x : pos.get(n.key)!.y)))].sort((a, b) => (dir === "RL" || dir === "BT" ? b - a : a - b));
    const rankOf = (key: string) => along.indexOf(Math.round(horizontal ? pos.get(key)!.x : pos.get(key)!.y));
    along.forEach((_, r) => {
      const inRank = list.filter((n) => rankOf(n.key) === r).map((n) => ids.get(n.key)!);
      const arrows = edges.flatMap((e, i) => (Math.max(rankOf(e.from), rankOf(e.to)) === r ? [connIds[i]!] : []));
      const stepId = `s-${r + 1}`;
      ops.push({ op: "step.add", id: stepId, props: { title: r === 0 ? "Start" : `Layer ${r + 1}` } });
      if (arrows.length) ops.push({ op: "action.add", step: stepId, action: { type: "enter", effect: "draw-on", targets: arrows } });
      ops.push({ op: "action.add", step: stepId, action: { type: "enter", effect: "pop", targets: inRank, ...(arrows.length ? { delayMs: 300 } : {}), staggerMs: 80 } });
    });
    // Groups show with their first element; their own box does not draw, so nothing more is needed.
  }
  return finish(ops, opts.title ?? "Imported from Mermaid", [...warnings]);
}

function sequence(lines: string[], opts: { title?: string; steps?: boolean }): ImportResult {
  const participants: { key: string; text: string; actor: boolean }[] = [];
  const has = (key: string) => participants.some((p) => p.key === key);
  const add = (key: string, text?: string, actor = false) => {
    if (!has(key)) participants.push({ key, text: text ?? key, actor });
  };
  const messages: { from: string; to: string; text: string; dashed: boolean; head: "arrow" | "bar" | "none" }[] = [];
  const notes: { over: string[]; text: string; after: number; side: "over" | "left" | "right" }[] = [];
  const warnings = new Set<string>();

  for (const line of lines.slice(1)) {
    let m = /^(participant|actor)\s+([^\s]+?)(?:\s+as\s+(.+))?$/.exec(line);
    if (m) {
      add(m[2]!, m[3] ? clean(m[3]) : undefined, m[1] === "actor");
      continue;
    }
    m = /^([^\s-+>]+?)\s*(-{1,2})(>>|>|x|\))([+-]?)\s*([^\s:+-]+?)\s*:\s*(.*)$/.exec(line);
    if (m) {
      add(m[1]!);
      add(m[5]!);
      messages.push({ from: m[1]!, to: m[5]!, text: clean(m[6]!), dashed: m[2] === "--", head: m[3] === "x" ? "bar" : "arrow" });
      continue;
    }
    m = /^note\s+(over|left of|right of)\s+([^:]+):\s*(.*)$/i.exec(line);
    if (m) {
      const over = m[2]!.split(",").map((s) => s.trim());
      over.forEach((p) => add(p));
      notes.push({ over, text: clean(m[3]!), after: messages.length, side: m[1]!.startsWith("left") ? "left" : m[1]!.startsWith("right") ? "right" : "over" });
      continue;
    }
    if (/^(activate|deactivate|autonumber|loop|alt|else|opt|par|and|critical|break|rect|end|box)\b/.test(line)) {
      warnings.add(`Mermaid '${line.split(/\s/)[0]}' does not convert. The messages convert.`);
      continue;
    }
    warnings.add(`A line did not convert: ${line}`);
  }
  if (participants.length === 0) throw new ImportError("The sequence diagram has no participants.");

  const used = new Set<string>();
  const take = (base: string) => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  const ids = new Map(participants.map((p) => [p.key, take(slug(p.key) || "participant")]));
  const GAP = 320;
  const W = 220;
  const H = 80;
  const ROW = 90;
  const cx = (key: string) => participants.findIndex((p) => p.key === key) * GAP + W / 2;
  const rows = messages.length + notes.length;
  const bottom = H + 60 + (rows + 1) * ROW;
  const ops: OperationInput[] = [];
  const lifelines: string[] = [];
  participants.forEach((p, i) => {
    const id = ids.get(p.key)!;
    if (p.actor) ops.push({ op: "element.add", id, type: "icon", props: { pack: "lucide", name: "user", x: i * GAP + W / 2 - 40, y: 0, width: 80, height: 80, label: p.text } });
    else ops.push({ op: "element.add", id, type: "rectangle", props: { x: i * GAP, y: 0, width: W, height: H, label: p.text } });
    const line = take(`life-${id}`.slice(0, 44));
    lifelines.push(line);
    ops.push({ op: "element.add", id: line, type: "connector", props: { start: { kind: "free", x: i * GAP + W / 2, y: H + 20 }, end: { kind: "free", x: i * GAP + W / 2, y: bottom }, endHead: "none", style: { strokeStyle: "dashed", stroke: "muted" } } });
  });

  const stepOps: OperationInput[] = [];
  if (opts.steps !== false) {
    stepOps.push({ op: "step.add", id: "s-participants", props: { title: "Participants" } });
    stepOps.push({ op: "action.add", step: "s-participants", action: { type: "enter", effect: "pop", targets: participants.map((p) => ids.get(p.key)!), staggerMs: 120 } });
    stepOps.push({ op: "action.add", step: "s-participants", action: { type: "enter", effect: "draw-on", targets: lifelines, delayMs: 300 } });
  }
  let row = 0;
  const noteAt = (k: number) => {
    for (const n of notes.filter((x) => x.after === k)) {
      const y = H + 60 + ++row * ROW - 30;
      const xs = n.over.map(cx);
      const left = n.side === "left" ? xs[0]! - 260 : n.side === "right" ? xs[0]! + 40 : Math.min(...xs) - 110;
      const width = n.side === "over" ? Math.max(...xs) - Math.min(...xs) + 220 : 220;
      const id = take(`note-${row}`);
      ops.push({ op: "element.add", id, type: "rectangle", props: { x: left, y, width, height: 60, label: n.text, style: { fill: "warning-soft", stroke: "warning", fontSize: 28 } } });
      if (opts.steps !== false) {
        stepOps.push({ op: "step.add", id: `s-${id}`, props: { title: n.text.slice(0, 40) } });
        stepOps.push({ op: "action.add", step: `s-${id}`, action: { type: "enter", effect: "fade", targets: [id] } });
      }
    }
  };
  noteAt(0);
  messages.forEach((m, k) => {
    const y = H + 60 + ++row * ROW;
    const id = take(`m-${k + 1}`);
    const x1 = cx(m.from);
    const x2 = cx(m.to);
    const self = m.from === m.to;
    ops.push({
      op: "element.add",
      id,
      type: "connector",
      props: {
        start: { kind: "free", x: x1, y },
        end: { kind: "free", x: self ? x1 : x2, y: self ? y + 40 : y },
        ...(self ? { waypoints: [{ x: x1 + 90, y }, { x: x1 + 90, y: y + 40 }] } : {}),
        endHead: m.head,
        ...(m.text ? { label: m.text } : {}),
        style: { ...(m.dashed ? { strokeStyle: "dashed" } : {}), fontSize: 28 },
      },
    });
    if (opts.steps !== false) {
      stepOps.push({ op: "step.add", id: `s-${id}`, props: { title: m.text.slice(0, 40) || `Message ${k + 1}` } });
      stepOps.push({ op: "action.add", step: `s-${id}`, action: { type: "enter", effect: "draw-on", targets: [id] } });
    }
    noteAt(k + 1);
  });
  return finish([...ops, ...stepOps], opts.title ?? "Imported from Mermaid", [...warnings]);
}

function finish(ops: OperationInput[], title: string, warnings: string[]): ImportResult {
  const empty = loadScene({ schemaVersion: 1, meta: { title }, settings: { theme: "studio-dark" } });
  if (!empty.ok) throw new Error("The empty scene is not valid.");
  const bus = new OperationBus(empty.scene);
  // Elements with an enter action start hidden: the steps show them.
  const r = bus.apply({ label: "Import Mermaid", ops });
  if (!r.ok) throw new ImportError(`The Mermaid text did not convert: ${r.error.message}`);
  const entered = new Set(bus.scene.steps.flatMap((s) => s.actions.flatMap((a) => (a.type === "enter" ? a.targets : []))));
  const hide = [...entered].filter((id) => bus.scene.elements[id]?.visible).map((id) => ({ op: "element.update" as const, id, set: { visible: false } }));
  if (hide.length) bus.apply({ label: "Hide until the steps", ops: hide });
  const fit = fitCamera(bus.scene);
  if (fit) bus.apply({ label: "Fit camera", ops: [{ op: "scene.settings", set: { camera: fit } }] });
  return { scene: bus.scene, assets: new Map(), warnings };
}
