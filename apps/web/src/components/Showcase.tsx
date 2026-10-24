/**
 * What Anivo can do (docs/20 B9): live examples on the home screen. Each card
 * plays a short scene in a loop; click a card to open it as a new scene.
 */
import { resolveTimeline } from "@anivo/engine";
import { type Ctx2D, renderScene } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import { applyScript } from "@anivo/script";
import { Text, makeStyles } from "@fluentui/react-components";
import { useEffect, useMemo, useRef } from "react";
import { openAsNew } from "../files.js";

const EXAMPLES: { title: string; text: string; script: string }[] = [
  {
    title: "Words in focus",
    text: "Mark words: color, underline, highlight, dim the rest.",
    script: `scene "Words in focus" theme=studio-dark size=1920x1080
text s "The Taptic Engine gives haptic feedback to every click" at=260,380 size=1400x260 font-size=84
step "Type" hold=300ms
  enter s typewriter unit=word dur=1200ms
step "Link" hold=500ms
  mark s "Taptic Engine" color=accent underline=accent
step "Focus" hold=1200ms
  mark s "haptic" color=text highlight=accent-soft dim=line +100ms`,
  },
  {
    title: "Send a message",
    text: "A bubble types, then goes along the arrows.",
    script: `scene "Send a message" theme=studio-dark size=1920x1080
box alice "Alice" at=160,440 size=320x160 fill=accent-soft stroke=accent radius=24 font-size=48
box srv "Server" at=800,440 size=320x160 radius=24 font-size=48
box bob "Bob" at=1440,440 size=320x160 fill=teal-soft stroke=teal radius=24 font-size=48
arrow alice -> srv id=up
arrow srv -> bob id=down
box m "Meet at 7?" at=180,250 size=300x100 fill=surface-strong stroke=accent radius=50 font-size=40
step "Type" hold=200ms
  enter m typewriter dur=700ms
step "Send" hold=900ms
  move m along=up dur=1300ms
  move m along=down +1400ms dur=1300ms`,
  },
  {
    title: "UI that builds",
    text: "Meters, sliders, and charts fill up with presets.",
    script: `scene "UI that builds" theme=studio-dark size=1920x1080
widget mt meter at=200,160 size=240x780
widget sl slider at=560,330 size=620x220
widget ch bar-chart at=1260,300 size=560x480
step "Build" hold=1200ms
  preset fill-up mt-fill
  preset fill-right sl-fill +300ms
  preset fill-up ch-bar-1, ch-bar-2, ch-bar-3, ch-bar-4 +500ms`,
  },
  {
    title: "Diagrams that flow",
    text: "Draw boxes and arrows; steps animate the story.",
    script: `scene "Diagrams that flow" theme=studio-dark size=1920x1080
icon user lucide:user "User" at=180,420 size=200x200 fill=accent
box lb "Load balancer" at=620,450 size=440x150 radius=20 font-size=44
box p1 "pod-1" at=1380,220 size=320x130 radius=20 font-size=40
box p2 "pod-2" at=1380,470 size=320x130 radius=20 font-size=40
box p3 "pod-3" at=1380,720 size=320x130 radius=20 font-size=40
arrow user -> lb
arrow lb -> p1, p2, p3
step "Draw" hold=200ms
  preset rise-in user, lb, p1, p2, p3
  enter c-user-lb, c-lb-p1, c-lb-p2, c-lb-p3 draw-on +600ms
step "Flow" hold=1400ms
  flow c-user-lb
  flow c-lb-p1, c-lb-p2, c-lb-p3 round-robin +300ms`,
  },
  {
    title: "Titles that build",
    text: "Words rise one by one; an icon floats while it holds.",
    script: `scene "Titles that build" theme=studio-dark size=1920x1080 background=gradient
text t "Ship ideas as short animated videos" at=210,330 size=1500x300 font-size=104 text-align=center
icon star lucide:sparkles "" at=880,720 size=160x160 fill=accent
step "Title" hold=300ms
  enter t cascade unit=word dur=1300ms easing=linear
  enter star pop after=prev
  float star after=prev dur=3000ms`,
  },
  {
    title: "Numbers that count",
    text: "Bars fill in turn, then a number counts up in a short style.",
    script: `scene "Numbers that count" theme=studio-dark size=1920x1080
text n "0 users" at=560,120 size=800x160 font-size=120 text-align=center
box b1 "" at=360,760 size=180x140 fill=purple-soft stroke=purple radius=14
box b2 "" at=640,640 size=180x260 fill=purple-soft stroke=purple radius=14
box b3 "" at=920,520 size=180x380 fill=purple-soft stroke=purple radius=14
box b4 "" at=1200,400 size=180x500 fill=purple-soft stroke=purple radius=14
step "Grow" hold=1200ms
  enter b1, b2, b3, b4 wipe direction=up stagger=160ms dur=700ms
  count n from=0 to=1240000 format="{n} users" style=compact decimals=1 dur=1600ms after=prev`,
  },
  {
    title: "Motion you draw",
    text: "Draw a path (P): an element flies along it.",
    script: `scene "Motion you draw" theme=studio-dark size=1920x1080
box a "Start" at=160,700 size=280x140 radius=20 font-size=44
box b "Finish" at=1480,240 size=280x140 fill=teal-soft stroke=teal radius=20 font-size=44
icon p lucide:send "" at=240,560 size=120x120 fill=accent
step "Fly" hold=900ms
  enter a, b pop stagger=150ms
  move p path="300,620 700,300 1100,800 1560,420" curve orient after=prev dur=2200ms
  pulse b after=prev`,
  },
];

const useStyles = makeStyles({
  row: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "8px",
    borderRadius: "12px",
    border: "1px solid var(--ui-outline)",
    backgroundColor: "var(--ui-panel)",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--ui-text)",
    transition: "transform 160ms ease, box-shadow 160ms ease",
    ":hover": { transform: "translateY(-2px)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" },
    ":focus-visible": { outline: "2px solid var(--ui-select)" },
  },
  canvas: { width: "100%", aspectRatio: "16 / 9", borderRadius: "8px", display: "block", backgroundColor: "#181818" },
  title: { fontWeight: 600, fontSize: "14px" },
  text: { fontSize: "12px", color: "var(--ui-muted)" },
});

function Card({ title, text, scene }: { title: string; text: string; scene: Scene }) {
  const s = useStyles();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 480;
    c.height = 270;
    const ctx = c.getContext("2d") as unknown as Ctx2D;
    const total = resolveTimeline(scene).totalMs + 800;
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e?.isIntersecting ?? true));
    io.observe(c);
    const t0 = performance.now();
    const loop = (now: number) => {
      if (visible) renderScene(ctx, scene, (now - t0) % total, { width: c.width, height: c.height });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [scene]);
  return (
    <button type="button" className={s.card} aria-label={`Example: ${title}. Open it in the editor.`} onClick={() => openAsNew(scene, new Map())}>
      <canvas ref={ref} className={s.canvas} aria-hidden />
      <span className={s.title}>{title}</span>
      <span className={s.text}>{text}</span>
    </button>
  );
}

export function Showcase() {
  const s = useStyles();
  const scenes = useMemo(() => EXAMPLES.map((e) => ({ ...e, r: applyScript(e.script) })), []);
  return (
    <section aria-labelledby="home-showcase" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Text id="home-showcase" as="h2" size={500} weight="semibold">
        What you can make
      </Text>
      <div className={s.row}>{scenes.map((e) => (e.r.ok ? <Card key={e.title} title={e.title} text={e.text} scene={e.r.scene} /> : null))}</div>
    </section>
  );
}
