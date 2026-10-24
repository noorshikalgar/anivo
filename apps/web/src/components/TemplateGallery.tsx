import { Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, Text, makeStyles, tokens } from "@fluentui/react-components";
import { resolveTimeline } from "@anivo/engine";
import { type Ctx2D, renderScene } from "@anivo/render";
import { type Scene, TEMPLATES } from "@anivo/schema";
import { useEffect, useRef, useState } from "react";
import { loadTemplate } from "../assets.js";
import { newFromTemplate } from "../files.js";
import { withErrors } from "../notify.js";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  surface: { maxWidth: "960px", width: "100%" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: tokens.spacingHorizontalM, maxHeight: "70vh", overflowY: "auto", padding: "2px" },
  card: {
    border: "none",
    backgroundColor: "transparent",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusLarge,
    outline: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    ":focus-visible": { outline: `2px solid ${tokens.colorBrandStroke1}` },
  },
  thumb: { width: "100%", aspectRatio: "16 / 9", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  muted: { color: tokens.colorNeutralForeground3 },
});

/**
 * A small picture of the end of the template's last step. Point at it to play
 * the template (docs/27). A vertical template keeps its shape.
 */
export function TemplateThumb({ name }: { name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const styles = useStyles();
  const [scene, setScene] = useState<Scene | null>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    let live = true;
    void loadTemplate(name)
      .then((sc) => live && setScene(sc))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [name]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !scene) return;
    const v = scene.settings.video;
    c.height = 270;
    c.width = Math.round((270 * v.width) / v.height);
    const ctx = c.getContext("2d") as unknown as Ctx2D;
    const tl = resolveTimeline(scene);
    const last = tl.steps[tl.steps.length - 1];
    const draw = (t: number) => renderScene(ctx, scene, t, { width: c.width, height: c.height });
    if (!hover) return void draw(last ? Math.max(last.startMs, last.holdEndMs - 1) : -1);
    // Twice as fast, so a point at the card shows the whole template.
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      draw(((now - t0) * 2) % (tl.totalMs + 600));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene, hover]);
  return <canvas ref={ref} className={styles.thumb} style={{ objectFit: "contain" }} aria-hidden onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />;
}

/** Templates gallery (FR-FILE-08). */
export function TemplateGallery() {
  const styles = useStyles();
  const open = useEditor((s) => s.galleryOpen);
  const close = () => useEditor.setState({ galleryOpen: false });
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface} aria-label="Templates">
        <DialogBody>
          <DialogTitle>New from template</DialogTitle>
          <DialogContent>
            <div className={styles.grid}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  className={styles.card}
                  onClick={() => {
                    close();
                    void withErrors(() => newFromTemplate(t.name));
                  }}
                >
                  {open && <TemplateThumb name={t.name} />}
                  <Text weight="semibold">{t.title}</Text>
                  <Text size={200} className={styles.muted}>
                    {t.description}
                  </Text>
                </button>
              ))}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
