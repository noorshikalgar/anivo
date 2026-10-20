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
