/**
 * The widget gallery (docs/05 "Widgets"): built-in widgets and the user's
 * own widgets, with a picture of each. Click a widget to insert it at the
 * center of the view.
 */
import { OperationBus, widgetOps } from "@anivo/ops";
import { type Ctx2D, renderScene } from "@anivo/render";
import { type Element, type Scene, loadScene } from "@anivo/schema";
import { Popover, PopoverSurface, PopoverTrigger, Tooltip, makeStyles } from "@fluentui/react-components";
import { Apps20Regular, Delete16Regular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { withErrors } from "../notify.js";
import { useEditor } from "../store.js";
import { WIDGETS, type UserWidget, deleteUserWidget, insertUserWidget, insertWidget, listUserWidgets } from "../widgets.js";
import { IconButton } from "./ui.js";

const useStyles = makeStyles({
  surface: { width: "420px", maxHeight: "70vh", overflowY: "auto", padding: "10px", backgroundColor: "var(--ui-menu)", zIndex: 1000 },
  head: { fontSize: "12px", fontWeight: 600, color: "var(--ui-muted)", margin: "4px 2px 6px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" },
  tile: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "6px",
    border: "none",
    borderRadius: "6px",
    backgroundColor: "var(--ui-widget)",
    color: "var(--ui-text)",
    font: "inherit",
    fontSize: "11px",
    textAlign: "left",
    cursor: "pointer",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
  },
  thumb: { width: "100%", aspectRatio: "4 / 3", borderRadius: "4px", backgroundColor: "var(--ui-field)", display: "block" },
  del: { position: "absolute", top: "8px", right: "8px" },
  empty: { color: "var(--ui-faint)", fontSize: "11px", padding: "4px 2px" },
  btn: { width: "30px", height: "30px", minWidth: "30px", borderRadius: "4px", border: "none", background: "transparent", color: "var(--ui-text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", ":hover": { backgroundColor: "var(--ui-hover)" } },
});

/** A picture of a set of elements with the scene theme. */
export function Thumb({ make }: { make: () => Scene | null }) {
  const s = useStyles();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const scene = make();
    if (!c || !scene) return;
    c.width = 240;
    c.height = 180;
    renderScene(c.getContext("2d") as unknown as Ctx2D, scene, -1, { width: 240, height: 180 });
  }, []);
  return <canvas ref={ref} className={s.thumb} aria-hidden />;
}

/** A small scene that shows elements, framed with a margin. */
function frameScene(elements: Record<string, unknown>, box: { x: number; y: number; width: number; height: number }): Scene | null {
  const st = useEditor.getState().scene;
  const pad = Math.max(box.width, box.height) * 0.12 + 20;
  // A 4:3 camera around the elements.
  let w = box.width + pad * 2;
  let h = box.height + pad * 2;
  if (w / h > 4 / 3) h = (w * 3) / 4;
  else w = (h * 4) / 3;
  const r = loadScene({
    schemaVersion: 1,
    meta: { title: "widget" },
    settings: { ...st.settings, video: { ...st.settings.video, width: 1920, height: 1440 }, camera: { x: box.x + box.width / 2 - w / 2, y: box.y + box.height / 2 - h / 2, width: w, height: h } },
    elements,
  });
  return r.ok ? r.scene : null;
}

export function builtInScene(name: string): Scene | null {
  const def = WIDGETS.find((w) => w.name === name)!;
  const base = loadScene({ schemaVersion: 1, meta: { title: "w" } });
  if (!base.ok) return null;
  const bus = new OperationBus(base.scene);
  if (!bus.apply({ ops: widgetOps(def, { id: "w", x: 0, y: 0 }) }).ok) return null;
  return frameScene(bus.scene.elements, { x: 0, y: 0, width: def.width, height: def.height });
}

export function userScene(w: UserWidget): Scene | null {
  const els: Record<string, Element> = {};
  for (const e of w.elements) els[e.id] = e;
  const boxes = w.elements.filter((e) => e.type !== "connector" && e.type !== "group") as (Element & { x: number; y: number })[];
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return frameScene(els as unknown as Record<string, unknown>, { x, y, width: w.width, height: w.height });
}

export function WidgetsGallery() {
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<UserWidget[]>([]);
  const version = useEditor((st) => st.libraryVersion);
  const theme = useEditor((st) => `${st.scene.settings.theme}|${st.scene.settings.style}`);
  useEffect(() => {
    if (open) void listUserWidgets().then(setMine);
  }, [open, version]);
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="after-top" withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content="Widgets: ready-made parts (browser, phone, server, card…)" relationship="label" positioning="after">
          <button type="button" className={s.btn} aria-label="Widgets">
            <Apps20Regular />
          </button>
        </Tooltip>
      </PopoverTrigger>
      {/* The gallery is a portal inside the canvas tree: its pointer events must not reach the canvas handlers. */}
      <PopoverSurface className={s.surface} aria-label="Widget gallery" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <div className={s.head}>Widgets</div>
        <div className={s.grid} key={theme}>
          {WIDGETS.map((w) => (
            <button
              key={w.name}
              type="button"
              className={s.tile}
              title={w.description}
              aria-label={`Insert ${w.title}`}
              onClick={() => {
                setOpen(false);
                insertWidget(w);
              }}
            >
              <Thumb make={() => builtInScene(w.name)} />
              {w.title}
            </button>
          ))}
        </div>
        <div className={s.head} style={{ marginTop: 12 }}>
          My widgets
        </div>
        {mine.length === 0 ? (
          <div className={s.empty}>Select elements, then Save as widget (Element tab, or Edit menu).</div>
        ) : (
          <div className={s.grid}>
            {mine.map((w) => (
              <div key={w.id} style={{ position: "relative" }}>
                <button
                  type="button"
                  className={s.tile}
                  style={{ width: "100%" }}
                  aria-label={`Insert my widget ${w.name}`}
                  onClick={() => {
                    setOpen(false);
                    insertUserWidget(w);
                  }}
                >
                  <Thumb make={() => userScene(w)} />
                  {w.name}
                </button>
                <span className={s.del}>
                  <IconButton label={`Delete the widget ${w.name}`} icon={<Delete16Regular />} onClick={() => void withErrors(() => deleteUserWidget(w.id))} />
                </span>
              </div>
            ))}
          </div>
        )}
      </PopoverSurface>
    </Popover>
  );
}
