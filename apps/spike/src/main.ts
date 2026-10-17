import { exportVideoWeb, loadBundledFonts, loadIconPacks, supportedFormats, type WebExportFormat } from "@anivo/export-web";
import { type Ctx2D, renderScene } from "@anivo/render";
import { type Scene, loadScene } from "@anivo/schema";
import { resolveTimeline } from "@anivo/engine";

const fontsReady = Promise.all([loadBundledFonts(new URL("/fonts/", location.href).href), loadIconPacks(new URL("/icons/", location.href).href)]);

async function loadTemplate(): Promise<Scene> {
  const json: unknown = await (await fetch("/templates/load-balancer.anivo.json")).json();
  const r = loadScene(json);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.scene;
}
const sceneReady = loadTemplate();

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Test API for Playwright (tests/e2e). */
const api = {
  async ready() {
    await fontsReady;
    await sceneReady;
    return true;
  },
  async renderPng(timeMs: number, width: number, height: number, style?: "clean" | "sketch") {
    await api.ready();
    const scene = await sceneReady;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    renderScene(ctx as unknown as Ctx2D, scene, timeMs, { width, height, ...(style ? { style } : {}) });
    return blobToBase64(await canvas.convertToBlob({ type: "image/png" }));
  },
  async supportedFormats() {
    return supportedFormats(640, 360);
  },
  async exportVideo(format: WebExportFormat, width: number, height: number, fps: 24 | 30 | 60, startMs: number, endMs: number) {
    await api.ready();
    const scene = await sceneReady;
    const r = await exportVideoWeb(scene, { format, width, height, fps, range: { startMs, endMs }, quality: "standard" });
    return { frames: r.frames, mimeType: r.mimeType, base64: await blobToBase64(new Blob([r.data as BlobPart])) };
  },
};
(window as unknown as { anivo: typeof api }).anivo = api;

// Small interactive preview.
const view = document.querySelector<HTMLCanvasElement>("#view")!;
const scrub = document.querySelector<HTMLInputElement>("#scrub")!;
const sketch = document.querySelector<HTMLInputElement>("#sketch")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;
const ctx = view.getContext("2d")!;

void api.ready().then(async () => {
  const scene = await sceneReady;
  const total = resolveTimeline(scene).totalMs;
  const draw = () => renderScene(ctx as unknown as Ctx2D, scene, (Number(scrub.value) / 1000) * total, { width: view.width, height: view.height, style: sketch.checked ? "sketch" : "clean" });
  scrub.oninput = draw;
  sketch.onchange = draw;
  draw();

  let playing = false;
  document.querySelector<HTMLButtonElement>("#play")!.onclick = () => {
    playing = !playing;
    const start = performance.now() - (Number(scrub.value) / 1000) * total;
    const tick = (now: number) => {
      if (!playing) return;
      const t = (now - start) % total;
      scrub.value = String(Math.round((t / total) * 1000));
      draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  document.querySelector<HTMLButtonElement>("#mp4")!.onclick = async () => {
    status.textContent = "Exporting…";
    const r = await exportVideoWeb(scene, { format: "mp4", onProgress: (d, n) => (status.textContent = `${Math.round((d / n) * 100)}%`) });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([r.data as BlobPart], { type: r.mimeType }));
    a.download = "anivo.mp4";
    a.click();
    status.textContent = `Done: ${(r.data.byteLength / 1e6).toFixed(1)} MB`;
  };
});
