/**
 * Render a template to a video with the Node engine.
 * Usage: pnpm render:template [name] [out] [style]
 * Example: pnpm render:template load-balancer tests/output/demo.mp4 sketch
 */
import { readFileSync } from "node:fs";
import { exportVideo } from "@anivo/export-node";
import { loadScene } from "@anivo/schema";

const [name = "load-balancer", out = "tests/output/demo.mp4", style] = process.argv.slice(2);
const result = loadScene(JSON.parse(readFileSync(`assets/templates/${name}.anivo.json`, "utf8")));
if (!result.ok) {
  for (const issue of result.issues) console.error(`${issue.path}: ${issue.message}`);
  process.exit(1);
}
const started = Date.now();
const r = await exportVideo(result.scene, {
  out,
  format: out.endsWith(".webm") ? "webm" : out.endsWith(".gif") ? "gif" : "mp4",
  ...(style === "sketch" || style === "clean" ? { style } : {}),
  onProgress: (d, n) => {
    if (d % 60 === 0 || d === n) process.stdout.write(`\r${Math.round((d / n) * 100)}%`);
  },
});
console.log(`\n${r.out}: ${r.frames} frames, ${(r.durationMs / 1000).toFixed(1)} s video, ${(r.bytes / 1e6).toFixed(2)} MB, rendered in ${((Date.now() - started) / 1000).toFixed(1)} s`);
