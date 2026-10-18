import { Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, Text, makeStyles, tokens } from "@fluentui/react-components";
import { resolveTimeline } from "@anivo/engine";
import { type Ctx2D, renderScene } from "@anivo/render";
import { TEMPLATES } from "@anivo/schema";
import { useEffect, useRef } from "react";
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

/** A small picture of the end of the template's last step. */
export function TemplateThumb({ name }: { name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const styles = useStyles();
  useEffect(() => {
    let live = true;
    void loadTemplate(name).then((scene) => {
      const c = ref.current;
      if (!live || !c) return;
      c.width = 480;
      c.height = 270;
      const tl = resolveTimeline(scene);
      const last = tl.steps[tl.steps.length - 1];
      renderScene(c.getContext("2d") as unknown as Ctx2D, scene, last ? Math.max(last.startMs, last.holdEndMs - 1) : -1, { width: 480, height: 270 });
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [name]);
  return <canvas ref={ref} className={styles.thumb} aria-hidden />;
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
