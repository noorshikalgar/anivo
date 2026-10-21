/**
 * Builds (docs/16 section 4): many steps for a common pattern, in one action.
 * A build makes plain elements, steps, and actions. The user can change all
 * of them after.
 */
import type { Scene } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

export interface BulletBuildOptions {
  title: string;
  points: string[];
  /** Add an empty step before the title (a pause on the empty frame). */
  emptyFirst?: boolean;
  titleSize?: number;
  pointSize?: number;
  /** Prefix of each point. */
  bullet?: string;
  /** Hold time of each step, in ms. */
  holdMs?: number;
}

const free = (scene: Scene, base: string, taken: Set<string>): string => {
  let id = base;
  for (let n = 2; id in scene.elements || taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
};

/**
 * Bullet list: the title types in. Then each point types in at the center of
 * the frame, and in the next step it moves up into its place under the title.
 */
export function bulletListBuild(scene: Scene, o: BulletBuildOptions): OperationInput[] {
  const { width: W, height: H } = scene.settings.video;
  const titleSize = o.titleSize ?? Math.round(Math.min(W, H) * 0.067);
  const pointSize = o.pointSize ?? Math.round(Math.min(W, H) * 0.041);
  const hold = o.holdMs ?? 600;
  const bullet = o.bullet ?? "•";
  const taken = new Set<string>();
  const ops: OperationInput[] = [];
  const titleId = free(scene, "title", taken);
  const titleH = Math.round(titleSize * 1.6);
  const titleY = Math.round(H * 0.1);
  ops.push({ op: "element.add", id: titleId, type: "text", props: { content: { text: o.title }, x: Math.round(W * 0.1), y: titleY, width: Math.round(W * 0.8), height: titleH, style: { fontSize: titleSize, fontWeight: 700 } } });

  const lineH = Math.round(pointSize * 1.9);
  const listX = Math.round(W * 0.14);
  const listY = titleY + titleH + Math.round(pointSize * 1.2);
  const pointIds: string[] = [];
  o.points.forEach((text, i) => {
    const id = free(scene, `point-${i + 1}`, taken);
    pointIds.push(id);
    const label = bullet ? `${bullet} ${text}` : text;
    // The box fits the text (an estimate of the width), so it is at the center of the frame.
    const w = Math.min(Math.round(W * 0.8), Math.round(label.length * pointSize * 0.56 + pointSize * 1.2));
    ops.push({ op: "element.add", id, type: "text", props: { content: { text: label }, x: Math.round((W - w) / 2), y: Math.round(H / 2 - lineH / 2), width: w, height: lineH, style: { fontSize: pointSize, textAlign: "left" } } });
  });

  if (o.emptyFirst) ops.push({ op: "step.add", props: { title: "Start", holdMs: 0, actions: [{ type: "wait", durationMs: 1000 }] } });
  ops.push({ op: "step.add", props: { title: "Title", holdMs: hold, actions: [{ type: "enter", effect: "typewriter", targets: [titleId], sound: "keys" }] } });
  o.points.forEach((_, i) => {
    const id = pointIds[i]!;
    ops.push({ op: "step.add", props: { title: `Point ${i + 1}`, holdMs: hold, actions: [{ type: "enter", effect: "typewriter", targets: [id], sound: "keys" }] } });
    ops.push({ op: "step.add", props: { title: `Point ${i + 1} up`, holdMs: hold, actions: [{ type: "morph", targets: [id], to: { x: listX, y: listY + i * lineH }, durationMs: 700, easing: "ease-in-out", sound: "whoosh" }] } });
  });
  return ops;
}

/** One hop of a message path: a connector, and true to go from its end to its start. */
export interface Hop {
  arrow: string;
  reverse: boolean;
}

/** The shortest path of arrows from one element to another (either arrow direction), or undefined. */
export function findArrowPath(scene: Scene, from: string, to: string): Hop[] | undefined {
  const edges: { a: string; b: string; id: string }[] = [];
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "connector" || el.start.kind !== "bound" || el.end.kind !== "bound") continue;
    edges.push({ a: el.start.elementId, b: el.end.elementId, id: el.id });
  }
  const prev = new Map<string, { node: string; hop: Hop }>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n === to) break;
    for (const e of edges) {
      const next = e.a === n ? e.b : e.b === n ? e.a : undefined;
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: n, hop: { arrow: e.id, reverse: e.b === n } });
      queue.push(next);
    }
  }
  if (!seen.has(to) || from === to) return undefined;
  const path: Hop[] = [];
  for (let n = to; n !== from; n = prev.get(n)!.node) path.unshift(prev.get(n)!.hop);
  return path;
}

export interface MessageBuildOptions {
  from: string;
  to: string;
  text: string;
  /** The arrows to go along. Default: the shortest path of arrows from `from` to `to`. */
  path?: Hop[];
  /** Captions of the two steps. Empty: no caption. */
  typeCaption?: string;
  sendCaption?: string;
  /** Time on each arrow, in ms. */
  hopMs?: number;
  /** The bubble fill (a theme token or a color). */
  fill?: string;
}

/**
 * Message (docs/17 P3): a bubble at the sender. Step 1: the text types in the
 * bubble. Step 2: the bubble moves along each arrow of the path to the
 * receiver, slow enough to follow.
 */
export function messageBuild(scene: Scene, o: MessageBuildOptions): { ops: OperationInput[]; id: string } | { error: string } {
  const path = o.path ?? findArrowPath(scene, o.from, o.to);
  if (!path || path.length === 0) return { error: `No arrows go from '${o.from}' to '${o.to}'. Draw an arrow between them first.` };
  const from = scene.elements[o.from];
  if (!from) return { error: `Element '${o.from}' does not exist.` };
  const { height: H, width: W } = scene.settings.video;
  const size = Math.round(Math.min(W, H) * 0.026);
  const lines = o.text.split("\n");
  const w = Math.min(Math.round(W * 0.3), Math.max(120, Math.round(Math.max(...lines.map((l) => l.length)) * size * 0.56 + size * 1.6)));
  const h = Math.round(lines.length * size * 1.35 + size * 1.1);
  // Above the sender. The send glides from here onto the arrow.
  const start = { x: from.x + from.width / 2, y: Math.max(h / 2 + 20, from.y - h / 2 - Math.round(size * 0.8)) };
  const taken = new Set<string>();
  const id = free(scene, "msg", taken);
  const hop = o.hopMs ?? 1600;
  const name = (eid: string) => {
    const el = scene.elements[eid];
    const t = el?.type === "text" ? el.content.text : el && "label" in el && el.label ? el.label.text : eid;
    return (t || eid).split("\n")[0]!;
  };
  const ops: OperationInput[] = [
    { op: "element.add", id, type: "rectangle", props: { label: { text: o.text }, x: Math.round(start.x - w / 2), y: Math.round(start.y - h / 2), width: w, height: h, style: { fill: o.fill ?? "accent-soft", stroke: "accent", cornerRadius: Math.round(h / 2.4), fontSize: size } } },
  ];
  const typeCaption = o.typeCaption ?? `${name(o.from)} types a message.`;
  const sendCaption = o.sendCaption ?? `The message goes to ${name(o.to)}.`;
  ops.push({
    op: "step.add",
    props: { title: `${name(o.from)} types`, holdMs: 400, ...(typeCaption ? { caption: { text: typeCaption, anchor: id } } : {}), actions: [{ type: "enter", effect: "typewriter", targets: [id], sound: "keys" }] },
  });
  ops.push({
    op: "step.add",
    props: {
      title: `To ${name(o.to)}`,
      holdMs: 500,
      ...(sendCaption ? { caption: { text: sendCaption, anchor: id } } : {}),
      // The points are set from the arrow routes when the steps exist (the operation bus syncs them).
      actions: path.map((p, i) => ({ type: "motion", targets: [id], delayMs: i * (hop + 200), durationMs: hop, easing: "ease-in-out", sound: "whoosh", motion: { points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], along: p.arrow, reverse: p.reverse } })),
    },
  });
  return { ops, id };
}
