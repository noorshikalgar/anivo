/**
 * The Presets panel (docs/20 B5): a tile for each motion preset. Point at a
 * tile to see the animation; click it to apply the preset to the selection.
 */
import { type MotionPreset, presetOps } from "@anivo/ops";
import { type Ctx2D, renderScene } from "@anivo/render";
import { loadScene } from "@anivo/schema";
import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, makeStyles } from "@fluentui/react-components";
import { Delete16Regular } from "@fluentui/react-icons";
import { resolveTimeline } from "@anivo/engine";
import { OperationBus } from "@anivo/ops";
import { useEffect, useRef, useState } from "react";
import { allBuiltins, applyPreset, deleteUserPreset, listUserPresets, saveSelectionAsPreset } from "../presets.js";
import { useEditor } from "../store.js";
import { Btn, Note, Panel } from "./ui.js";

const W = 132;
const H = 74;

const useStyles = makeStyles({
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: "6px" },
  tile: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    padding: "4px",
    border: "1px solid var(--ui-outline)",
    borderRadius: "6px",
    backgroundColor: "var(--ui-field)",
    color: "var(--ui-text)",
    cursor: "pointer",
    textAlign: "left",
    fontSize: "11px",
    ":hover": { border: "1px solid var(--ui-select)" },
    ":focus-visible": { outline: "2px solid var(--ui-select)" },
  },
  canvas: { width: "100%", aspectRatio: `${W} / ${H}`, borderRadius: "4px", display: "block" },
  del: { position: "absolute", top: "6px", right: "6px", border: "none", borderRadius: "3px", background: "rgba(0,0,0,0.5)", color: "#fff", cursor: "pointer", padding: "1px", display: "flex" },
});

/** A small scene that shows a preset: two boxes, a text, or a number, as the preset needs. */
function previewScene(p: MotionPreset) {
  const text = p.id === "count-up" ? "99%" : p.id === "words-in" || p.id === "type-in" ? "Hello world" : "";
  const roles = p.mode === "roles" ? Math.max(0, ...p.actions.flatMap((x) => x.roles ?? [0])) + 1 : 2;
  const els: Record<string, unknown> = {};
  const ids: string[] = [];
  if (text) {
    els["t"] = { type: "text", z: "a0", x: 60, y: 300, width: 840, height: 180, content: { text }, style: { fontSize: text === "99%" ? 150 : 110 } };
    ids.push("t");
  } else {
    const n = Math.min(3, Math.max(1, roles));
    for (let i = 0; i < n; i++) {
      const w = 640 / n;
      els[`b${i}`] = { type: "rectangle", z: `a${i}`, x: 120 + i * (w + 40), y: 250, width: w - 20, height: p.id.startsWith("fill") ? 300 : 240, style: { fill: "accent", stroke: "transparent", cornerRadius: 28 } };
      ids.push(`b${i}`);
    }
  }
  const r = loadScene({ schemaVersion: 1, meta: { title: "Preview" }, settings: { theme: "studio-dark", video: { width: 960, height: 540, fps: 30 } }, elements: els, steps: [{ id: "s", holdMs: 600, actions: [] }] });
  if (!r.ok) return null;
  const bus = new OperationBus(r.scene);
  const ops = presetOps(bus.scene, "s", p, ids);
  if ("error" in ops) return null;
  // Exits need the element on screen first.
  if (p.actions.some((x) => x.action.type === "exit")) bus.apply({ ops: [{ op: "step.update", id: "s", set: { holdMs: 300 } }] });
  bus.apply({ ops });
  return bus.scene;
}

function Tile({ preset, onDelete }: { preset: MotionPreset; onDelete?: () => void }) {
  const s = useStyles();
  const ref = useRef<HTMLCanvasElement>(null);
  const scene = useRef(previewScene(preset));
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const c = ref.current;
    const sc = scene.current;
    if (!c || !sc) return;
    c.width = W * 2;
    c.height = H * 2;
    const ctx = c.getContext("2d") as unknown as Ctx2D;
    const total = resolveTimeline(sc).totalMs;
    const draw = (t: number) => renderScene(ctx, sc, t, { width: c.width, height: c.height });
    if (!hover) {
      // At rest: the end (exits: the start, so the element shows).
      draw(preset.actions.some((x) => x.action.type === "exit") ? 0 : total);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      draw((now - t0) % (total + 500));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hover, preset]);
  return (
    <button type="button" className={s.tile} title={preset.description} aria-label={`Preset: ${preset.name}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)} onClick={() => applyPreset(preset)}>
      <canvas ref={ref} className={s.canvas} aria-hidden />
      {preset.name}
      {onDelete && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Delete the preset ${preset.name}`}
          className={s.del}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Delete16Regular />
        </span>
      )}
    </button>
  );
}

export function PresetsPanel() {
  const s = useStyles();
  const [mine, setMine] = useState<MotionPreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const selection = useEditor((st) => st.selection);
  useEffect(() => {
    void listUserPresets().then(setMine);
  }, []);
  return (
    <Panel id="act-presets" title="Presets">
      <Note>{selection.length ? "Point at a preset to see it; click to apply it to the selection." : "Select elements, then click a preset."}</Note>
      <div className={s.grid} role="group" aria-label="Motion presets">
        {allBuiltins().map((p) => (
          <Tile key={p.id} preset={p} />
        ))}
        {mine.map((p) => (
          <Tile key={p.id} preset={p} onDelete={() => void deleteUserPreset(p.id).then(() => listUserPresets().then(setMine))} />
        ))}
      </div>
      <Btn onClick={() => setSaving(true)} disabled={selection.length === 0}>
        Save the actions of the selection as a preset…
      </Btn>
      <Dialog open={saving} onOpenChange={(_, d) => !d.open && setSaving(false)}>
        <DialogSurface aria-label="Save as preset" style={{ maxWidth: "420px" }}>
          <DialogBody>
            <DialogTitle>Save as preset</DialogTitle>
            <DialogContent>
              <Note>The actions of the selected elements in this step become a preset. With many elements, the first selected element is role 1, the second role 2, and so on.</Note>
              <Input style={{ width: "100%" }} aria-label="Preset name" placeholder="My entrance" value={name} onChange={(_, d) => setName(d.value)} onKeyDown={(e) => e.stopPropagation()} />
            </DialogContent>
            <DialogActions>
              <Btn onClick={() => setSaving(false)}>Cancel</Btn>
              <Btn
                primary
                onClick={() =>
                  void saveSelectionAsPreset(name).then((p) => {
                    if (!p) return;
                    setSaving(false);
                    setName("");
                    void listUserPresets().then(setMine);
                  })
                }
              >
                Save
              </Btn>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Panel>
  );
}
