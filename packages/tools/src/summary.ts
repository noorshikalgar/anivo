import { resolveTimeline } from "@anivo/engine";
import type { Action, Scene } from "@anivo/schema";

function actionText(a: Action): string {
  const t = a.targets.join(", ");
  if (a.type === "enter" || a.type === "exit" || a.type === "emphasis") return `${a.type === "emphasis" ? a.effect : `${a.type} ${a.effect}`} ${t}`;
  if (a.type === "morph") return `morph ${t} (${Object.keys(a.to).join(", ")})`;
  if (a.type === "flow") return `flow ${t}`;
  if (a.type === "counter") return `count ${t} ${a.counter.from} to ${a.counter.to}`;
  if (a.type === "camera") return `camera ${a.camera.op}${t ? ` ${t}` : ""}`;
  if (a.type === "mark") return `mark ${t} "${a.mark.phrase}"`;
  if (a.type === "wait") return `wait ${a.durationMs ?? 1000} ms`;
  return `${a.type} ${t}`;
}

/**
 * A compact outline of a scene for agents (docs/09 anivo_scene_summary):
 * elements with IDs, types, labels, and boxes; steps with times and actions.
 */
export function sceneSummary(scene: Scene): string {
  const tl = resolveTimeline(scene);
  const s = scene.settings;
  const lines = [`Scene "${scene.meta.title}": ${s.style}, ${s.theme}, ${s.video.width}x${s.video.height} at ${s.video.fps} fps, ${(tl.totalMs / 1000).toFixed(1)} s`, ""];
  const els = Object.values(scene.elements).sort((a, b) => (a.z < b.z ? -1 : 1));
  lines.push(`Elements (${els.length}):`);
  for (const e of els) {
    const label = e.type === "text" ? e.content.text : e.label?.text;
    const where =
      e.type === "connector"
        ? `${e.start.kind === "bound" ? e.start.elementId : `${e.start.x},${e.start.y}`} -> ${e.end.kind === "bound" ? e.end.elementId : `${e.end.x},${e.end.y}`}`
        : `at ${Math.round(e.x)},${Math.round(e.y)} size ${Math.round(e.width)}x${Math.round(e.height)}`;
    lines.push(`  ${e.id} (${e.type === "icon" ? `icon ${e.pack}:${e.name}` : e.type}${e.parentId ? ` in ${e.parentId}` : ""})${label ? ` "${label}"` : ""} ${where}`);
  }
  lines.push("", `Steps (${scene.steps.length}):`);
  scene.steps.forEach((st, i) => {
    const t = tl.steps[i]!;
    lines.push(`  ${i + 1}. ${st.id} "${st.title}" ${(t.startMs / 1000).toFixed(1)}-${(t.holdEndMs / 1000).toFixed(1)} s${st.trigger.kind === "click" ? " (on click)" : ""}`);
    for (const a of st.actions) {
      // The times of the action, from its first start to its last end (with stagger and chains).
      const timed = t.actions.filter((x) => x.action.id === a.id);
      const when = timed.length ? ` ${(Math.min(...timed.map((x) => x.startMs)) / 1000).toFixed(1)}-${(Math.max(...timed.map((x) => x.endMs)) / 1000).toFixed(1)} s` : "";
      lines.push(`     - ${actionText(a)}${when}${a.after ? ` (after ${a.after})` : ""}`);
    }
  });
  const open = scene.comments.filter((c) => !c.resolved);
  if (open.length) {
    lines.push("", `Comments (${open.length} open; answer with comment.add replyTo, then resolve with comment.update):`);
    for (const c of open) lines.push(`  ${c.id} on ${c.target.kind} ${c.target.id}, by ${c.author}${c.replyTo ? ` (answer to ${c.replyTo})` : ""}: ${c.text}`);
  }
  return lines.join("\n");
}
