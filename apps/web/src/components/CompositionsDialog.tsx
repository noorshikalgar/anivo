/**
 * Compositions (docs/20 B6): a gallery of saved compositions with a live
 * preview. Insert one in this scene, save the selection as a new one, or
 * move them between computers as files.
 */
import { resolveTimeline } from "@anivo/engine";
import { type Composition, OperationBus, compositionSlots, insertCompositionOps } from "@anivo/ops";
import { type Ctx2D, renderScene } from "@anivo/render";
import { loadScene } from "@anivo/schema";
import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, makeStyles } from "@fluentui/react-components";
import { useEffect, useRef, useState } from "react";
import { deleteComposition, exportComposition, importComposition, insertComposition, listCompositions, saveSelectionAsComposition } from "../compositions.js";
import { useEditor } from "../store.js";
import { Btn, Note } from "./ui.js";

const useStyles = makeStyles({
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px", maxHeight: "52vh", overflowY: "auto", padding: "2px" },
  card: { display: "flex", flexDirection: "column", gap: "4px", border: "1px solid var(--ui-outline)", borderRadius: "8px", padding: "6px", backgroundColor: "var(--ui-field)" },
  canvas: { width: "100%", aspectRatio: "16 / 9", borderRadius: "5px", display: "block", cursor: "pointer" },
  row: { display: "flex", gap: "4px", flexWrap: "wrap" },
  name: { fontWeight: 600, fontSize: "13px" },
  meta: { fontSize: "11px", color: "var(--ui-muted)" },
  slots: { display: "flex", flexDirection: "column", gap: "4px" },
});

/** A scene with only the composition, for the preview. */
function previewScene(c: Composition, theme: string) {
  const W = Math.max(640, c.width + 160);
  const H = Math.round((W * 9) / 16);
  const r = loadScene({ schemaVersion: 1, meta: { title: c.name }, settings: { theme, video: { width: W, height: Math.max(H, c.height + 120), fps: 30 } } });
  if (!r.ok) return null;
  const bus = new OperationBus(r.scene);
  const ins = insertCompositionOps(bus.scene, c, { x: (W - c.width) / 2, y: (Math.max(H, c.height + 120) - c.height) / 2 });
  return bus.apply({ ops: ins.ops }).ok ? bus.scene : null;
}

export function CompositionPreview({ c }: { c: Composition }) {
  const s = useStyles();
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useEditor((st) => st.scene.settings.theme);
  const [hover, setHover] = useState(false);
  const scene = useRef(previewScene(c, theme));
  useEffect(() => {
    const cv = ref.current;
    const sc = scene.current;
    if (!cv || !sc) return;
    cv.width = 400;
    cv.height = 225;
    const ctx = cv.getContext("2d") as unknown as Ctx2D;
    const total = resolveTimeline(sc).totalMs;
    const draw = (t: number) => renderScene(ctx, sc, t, { width: cv.width, height: cv.height });
    if (!hover) return void draw(total);
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      draw((now - t0) % (total + 600));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hover]);
  return <canvas ref={ref} className={s.canvas} aria-hidden onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />;
}

export function CompositionsDialog() {
  const s = useStyles();
  const open = useEditor((st) => st.compositionsOpen);
  const selection = useEditor((st) => st.selection);
  const [list, setList] = useState<Composition[]>([]);
  const [name, setName] = useState("");
  // The composition whose texts the user sets before inserting it (docs/21 C10).
  const [filling, setFilling] = useState<{ id: string; texts: Record<string, string> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () => void listCompositions().then(setList);
  useEffect(() => {
    if (open) reload();
  }, [open]);
  const close = () => useEditor.setState({ compositionsOpen: false });
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface aria-label="Compositions" style={{ maxWidth: "860px", width: "90vw" }}>
        <DialogBody>
          <DialogTitle>Compositions</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Note>A composition is elements with their animations. Save one, then insert it in any scene: its steps come after the selected step. Point at a preview to play it.</Note>
            <div className={s.row}>
              <Input aria-label="Composition name" placeholder="Name of the new composition" value={name} onChange={(_, d) => setName(d.value)} onKeyDown={(e) => e.stopPropagation()} style={{ minWidth: 240 }} />
              <Btn primary disabled={selection.length === 0} onClick={() => void saveSelectionAsComposition(name).then((c) => c && (setName(""), reload()))}>
                Save the selection
              </Btn>
              <Btn onClick={() => fileRef.current?.click()}>Import a file…</Btn>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importComposition(f).then(reload);
                  e.target.value = "";
                }}
              />
            </div>
            {list.length === 0 ? (
              <Note>No compositions yet. Select elements that have animations, type a name, and click Save the selection.</Note>
            ) : (
              <div className={s.grid} role="list" aria-label="Saved compositions">
                {list.map((c) => (
                  <div key={c.id} className={s.card} role="listitem" aria-label={c.name}>
                    <CompositionPreview c={c} />
                    <span className={s.name}>{c.name}</span>
                    <span className={s.meta}>
                      {c.elements.length} elements · {c.steps.length} step{c.steps.length === 1 ? "" : "s"}
                    </span>
                    {filling?.id === c.id && (
                      <div className={s.slots} role="group" aria-label={`Texts of ${c.name}`}>
                        {compositionSlots(c).map((slot) => (
                          <Input
                            key={slot.id}
                            aria-label={`Text: ${slot.text}`}
                            value={filling.texts[slot.id] ?? slot.text}
                            onChange={(_, d) => setFilling({ id: c.id, texts: { ...filling.texts, [slot.id]: d.value } })}
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        ))}
                      </div>
                    )}
                    <div className={s.row}>
                      <Btn
                        primary
                        onClick={() => {
                          insertComposition(c, filling?.id === c.id ? filling.texts : {});
                          setFilling(null);
                          close();
                        }}
                      >
                        Insert
                      </Btn>
                      {compositionSlots(c).length > 0 && filling?.id !== c.id && <Btn onClick={() => setFilling({ id: c.id, texts: {} })}>Set texts…</Btn>}
                      <Btn onClick={() => exportComposition(c)}>Export</Btn>
                      <Btn onClick={() => void deleteComposition(c.id).then(reload)}>Delete</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Btn onClick={close}>Close</Btn>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
