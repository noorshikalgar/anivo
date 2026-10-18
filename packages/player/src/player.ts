/**
 * <anivo-player>: plays an Anivo scene in a web page (FR-PLAY-02).
 *
 * Attributes:
 * - src: URL of a .anivo file (ZIP) or a scene JSON file.
 * - autoplay, loop, controls: like <video>.
 * - step: the step to show first (0 is the base state). Default: the base state.
 * - assets: URL of the folder with fonts/ and icons/. Default: "../" next to this script.
 *
 * A self-contained page puts the scene in a child <script type="application/json">
 * (see PlayerBundle). Then the player needs no network.
 */
import { type Timeline, resolveTimeline, sceneCaptions } from "@anivo/engine";
import { decodeSceneImages } from "@anivo/export-web/images";
import { unpack } from "@anivo/fileio";
import { type Ctx2D, type IconPack, type RenderOptions, registerIconPack, renderScene } from "@anivo/render";
import { type Scene, audioSegments, loadScene } from "@anivo/schema";
import { sceneNeeds } from "./needs.js";

/** Data of a self-contained player page. */
export interface PlayerBundle {
  /** The scene JSON (compact or full). */
  scene: unknown;
  /** Asset bytes as base64, by asset ID. */
  assets?: Record<string, string>;
  /** Icon packs with only the icons that the scene uses. */
  icons?: IconPack[];
  /** Font files as base64 WOFF2. */
  fonts?: { family: string; weight: string; data: string }[];
  /** Burn the captions into the frames. */
  captions?: "bottom" | "top";
}

const FONT_FILES: Record<string, { weight: string; file: string }[]> = {
  Inter: [
    { weight: "400", file: "inter-latin-400-normal.woff2" },
    { weight: "500", file: "inter-latin-500-normal.woff2" },
    { weight: "700", file: "inter-latin-700-normal.woff2" },
  ],
  Kalam: [
    { weight: "400", file: "kalam-latin-400-normal.woff2" },
    { weight: "700", file: "kalam-latin-700-normal.woff2" },
  ],
  "JetBrains Mono": [
    { weight: "400", file: "jetbrains-mono-latin-400-normal.woff2" },
    { weight: "500", file: "jetbrains-mono-latin-500-normal.woff2" },
  ],
};

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const ICON = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/>',
  prev: '<path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/>',
  next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/>',
};
const svg = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${d}</svg>`;

const STYLE = `
:host { display: block; position: relative; background: #0f1720; color: #e6edf3; font: 13px/1.4 system-ui, sans-serif; border-radius: 8px; overflow: hidden; }
:host([hidden]) { display: none; }
canvas { display: block; width: 100%; height: auto; cursor: pointer; }
.bar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; background: rgba(15, 23, 32, 0.92); }
:host(:not([controls])) .bar { display: none; }
button { all: unset; display: inline-flex; padding: 6px; border-radius: 6px; cursor: pointer; color: inherit; }
button:hover { background: rgba(255, 255, 255, 0.1); }
button:focus-visible { outline: 2px solid #4c9aff; }
input[type=range] { flex: 1; min-width: 0; accent-color: #4c9aff; }
.time { font-variant-numeric: tabular-nums; min-width: 84px; text-align: right; opacity: 0.8; }
.msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; text-align: center; }
`;

const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

export class AnivoPlayer extends HTMLElement {
  static observedAttributes = ["src", "step"];

  private root: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private playBtn: HTMLButtonElement;
  private range: HTMLInputElement;
  private timeText: HTMLSpanElement;
  private scene: Scene | null = null;
  private assets = new Map<string, Uint8Array>();
  private timeline: Timeline | null = null;
  private renderOpts: Partial<RenderOptions> = {};
  private time = -1;
  private playing = false;
  private raf = 0;
  private last = 0;
  private loadId = 0;
  private audioCtx: AudioContext | null = null;
  private audioBuffers = new Map<string, AudioBuffer>();
  private audioNodes: AudioScheduledSourceNode[] = [];
  private resizeObserver: ResizeObserver;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}</style>
      <canvas part="canvas" role="img" aria-label="Animated diagram"></canvas>
      <div class="bar" part="controls">
        <button class="prev" aria-label="Previous step">${svg(ICON.prev)}</button>
        <button class="play" aria-label="Play">${svg(ICON.play)}</button>
        <button class="next" aria-label="Next step">${svg(ICON.next)}</button>
        <input type="range" min="0" max="1" step="1" value="0" aria-label="Time">
        <span class="time">0:00.0</span>
      </div>`;
    this.canvas = this.root.querySelector("canvas")!;
    this.playBtn = this.root.querySelector(".play")!;
    this.range = this.root.querySelector("input")!;
    this.timeText = this.root.querySelector(".time")!;
    this.playBtn.addEventListener("click", () => (this.playing ? this.pause() : void this.play()));
    this.canvas.addEventListener("click", () => (this.playing ? this.pause() : void this.play()));
    this.root.querySelector(".prev")!.addEventListener("click", () => this.stepBy(-1));
    this.root.querySelector(".next")!.addEventListener("click", () => this.stepBy(1));
    this.range.addEventListener("input", () => {
      this.pause();
      this.seek(Number(this.range.value));
    });
    this.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (this.playing) this.pause();
        else void this.play();
      } else if (e.key === "ArrowRight") this.stepBy(1);
      else if (e.key === "ArrowLeft") this.stepBy(-1);
    });
    this.resizeObserver = new ResizeObserver(() => this.draw());
  }

  connectedCallback(): void {
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.resizeObserver.observe(this);
    void this.load();
  }

  disconnectedCallback(): void {
    this.pause();
    this.resizeObserver.disconnect();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (old === value || !this.isConnected) return;
    if (name === "src") void this.load();
    else if (name === "step" && this.timeline) this.goToStep(Number(value ?? 0));
  }

  /** Duration in milliseconds. */
  get duration(): number {
    return this.timeline?.totalMs ?? 0;
  }

  /** Current time in milliseconds. -1 is the base state. */
  get currentTime(): number {
    return this.time;
  }

  get paused(): boolean {
    return !this.playing;
  }

  private message(text: string | null): void {
    this.root.querySelector(".msg")?.remove();
    if (text === null) return;
    const div = document.createElement("div");
    div.className = "msg";
    div.textContent = text;
    this.root.appendChild(div);
  }

  private async load(): Promise<void> {
    const id = ++this.loadId;
    this.pause();
    try {
      const inline = this.querySelector('script[type="application/json"]');
      let bundle: PlayerBundle | null = null;
      let raw: unknown;
      if (inline?.textContent) {
        bundle = JSON.parse(inline.textContent) as PlayerBundle;
        raw = bundle.scene;
        this.assets = new Map(Object.entries(bundle.assets ?? {}).map(([k, v]) => [k, b64(v)]));
      } else {
        const src = this.getAttribute("src");
        if (!src) return;
        this.message("Loading…");
        const res = await fetch(src);
        if (!res.ok) throw new Error(`The scene did not load (HTTP ${res.status}).`);
        const r = unpack(new Uint8Array(await res.arrayBuffer()));
        if (!r.ok) throw new Error(`The file is not a valid Anivo scene. ${r.issues[0]?.message ?? ""}`);
        if (id !== this.loadId) return;
        this.assets = r.assets;
        raw = null;
        this.scene = r.scene;
      }
      if (raw !== null) {
        const r = loadScene(raw);
        if (!r.ok) throw new Error(`The scene is not valid. ${r.issues[0]?.message ?? ""}`);
        this.scene = r.scene;
      }
      const scene = this.scene!;
      await this.loadResources(scene, bundle);
      await decodeSceneImages(scene, this.assets);
      if (id !== this.loadId) return;
      this.timeline = resolveTimeline(scene);
      const caps = bundle?.captions ?? (this.getAttribute("captions") as "bottom" | "top" | null);
      this.renderOpts = caps ? { captions: { list: sceneCaptions(scene, this.timeline), position: caps } } : {};
      this.canvas.setAttribute("aria-label", scene.meta.title || "Animated diagram");
      this.range.max = String(Math.max(1, Math.round(this.timeline.totalMs)));
      this.message(null);
      this.goToStep(Number(this.getAttribute("step") ?? 0));
      this.dispatchEvent(new Event("ready"));
      if (this.hasAttribute("autoplay")) void this.play();
    } catch (err) {
      if (id !== this.loadId) return;
      this.message(err instanceof Error ? err.message : String(err));
      this.dispatchEvent(new CustomEvent("error", { detail: err }));
    }
  }

  private async loadResources(scene: Scene, bundle: PlayerBundle | null): Promise<void> {
    const needs = sceneNeeds(scene);
    // The asset folder is needed only when the page does not include the fonts and icons.
    const base = () => new URL(this.getAttribute("assets") ?? "../", import.meta.url);
    const fonts: Promise<unknown>[] = [];
    for (const family of needs.fonts) {
      const inline = bundle?.fonts?.filter((f) => f.family === family);
      const files = inline?.length ? inline.map((f) => ({ weight: f.weight, src: b64(f.data).buffer as ArrayBuffer })) : (FONT_FILES[family] ?? []).map((f) => ({ weight: f.weight, src: `url(${new URL(`fonts/${f.file}`, base()).href})` }));
      for (const f of files) fonts.push(new FontFace(family, f.src, { weight: f.weight }).load().then((face) => (document.fonts as unknown as { add(f: FontFace): void }).add(face), () => undefined));
    }
    const icons = bundle?.icons
      ? Promise.resolve(bundle.icons.forEach(registerIconPack))
      : Promise.all(
          needs.packs.map(async (p) => {
            const res = await fetch(new URL(`icons/${p}.json`, base()).href);
            if (res.ok) registerIconPack((await res.json()) as IconPack);
          }),
        );
    await Promise.all([...fonts, icons.catch(() => undefined)]);
  }

  private draw(): void {
    const scene = this.scene;
    if (!scene) return;
    const v = scene.settings.video;
    const w = Math.max(1, this.clientWidth);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(w * dpr);
    const height = Math.round((w * dpr * v.height) / v.width);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    renderScene(ctx as unknown as Ctx2D, scene, this.time, { width, height, ...this.renderOpts });
    if (this.time >= 0) this.range.value = String(Math.round(this.time));
    this.timeText.textContent = `${fmt(Math.max(0, this.time))} / ${fmt(this.duration)}`;
  }

  /** Show a time. -1 is the base state. */
  seek(ms: number): void {
    this.time = ms < 0 ? -1 : Math.min(ms, this.duration);
    this.draw();
  }

  /** Show the end of a step (1 is the first step). 0 is the base state. */
  goToStep(n: number): void {
    const steps = this.timeline?.steps ?? [];
    if (n <= 0 || steps.length === 0) return this.seek(-1);
    const s = steps[Math.min(n, steps.length) - 1]!;
    this.seek(Math.max(s.startMs, s.endMs - 1));
  }

  private stepBy(d: number): void {
    const steps = this.timeline?.steps ?? [];
    this.pause();
    // The step that shows now: the last step that started.
    let i = -1;
    steps.forEach((s, k) => this.time >= s.startMs && (i = k));
    // i + 1 is the number of the step that shows (0 is the base state).
    this.goToStep(d > 0 ? Math.min(steps.length, i + 2) : Math.max(0, i));
  }

  async play(): Promise<void> {
    if (this.playing || !this.timeline || this.duration <= 0) return;
    if (this.time >= this.duration || this.time < 0) this.time = 0;
    this.playing = true;
    this.playBtn.innerHTML = svg(ICON.pause);
    this.playBtn.setAttribute("aria-label", "Pause");
    this.dispatchEvent(new Event("play"));
    void this.startAudio();
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.playing) return;
      this.time += now - this.last;
      this.last = now;
      if (this.time >= this.duration) {
        if (this.hasAttribute("loop")) {
          this.time = 0;
          void this.startAudio();
        } else {
          this.time = this.duration;
          this.draw();
          this.pause();
          this.dispatchEvent(new Event("ended"));
          return;
        }
      }
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stopAudio();
    this.playBtn.innerHTML = svg(ICON.play);
    this.playBtn.setAttribute("aria-label", "Play");
    this.dispatchEvent(new Event("pause"));
  }

  private stopAudio(): void {
    for (const n of this.audioNodes) n.stop();
    this.audioNodes = [];
  }

  private async startAudio(): Promise<void> {
    this.stopAudio();
    const scene = this.scene;
    if (!scene || scene.audio.length === 0) return;
    const t0 = Math.max(0, this.time);
    const segs = audioSegments(scene, t0, this.duration).filter((s) => this.assets.has(s.assetId));
    if (segs.length === 0) return;
    const ac = (this.audioCtx ??= new AudioContext());
    if (ac.state === "suspended") await ac.resume().catch(() => undefined);
    for (const s of segs) {
      if (!this.audioBuffers.has(s.assetId)) {
        const buf = await ac.decodeAudioData(this.assets.get(s.assetId)!.slice().buffer).catch(() => null);
        if (buf) this.audioBuffers.set(s.assetId, buf);
      }
    }
    if (!this.playing) return;
    // The video moved on while the audio decoded.
    const elapsed = Math.max(0, this.time) - t0;
    for (const s of segs) {
      const buffer = this.audioBuffers.get(s.assetId);
      if (!buffer) continue;
      const node = ac.createBufferSource();
      node.buffer = buffer;
      const gain = ac.createGain();
      gain.gain.value = 10 ** (s.gainDb / 20);
      node.connect(gain).connect(ac.destination);
      const at = s.atMs - elapsed;
      const skip = Math.max(0, -at);
      if (s.toMs - s.fromMs - skip <= 0) continue;
      node.start(ac.currentTime + Math.max(0, at) / 1000, (s.fromMs + skip) / 1000, (s.toMs - s.fromMs - skip) / 1000);
      this.audioNodes.push(node);
    }
  }
}
