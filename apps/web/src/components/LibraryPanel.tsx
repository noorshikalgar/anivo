/**
 * The library (docs/22 D7): everything you can use again, in one place, with
 * one search. Widgets and compositions: click to insert at the center of the
 * view, or drag onto the canvas. Motion presets and styles: click to apply to
 * the selection.
 */
import type { Composition, MotionPreset, StylePreset } from "@anivo/ops";
import { makeStyles } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { listCompositions } from "../compositions.js";
import { allBuiltins, listUserPresets } from "../presets.js";
import { useEditor } from "../store.js";
import { builtinStyles, listUserStyles } from "../styles.js";
import { type UserWidget, WIDGETS, insertUserWidget, insertWidget, listUserWidgets } from "../widgets.js";
import { CompositionPreview } from "./CompositionsDialog.js";
import { PresetTile } from "./PresetsPanel.js";
import { StyleTile } from "./StylesPanel.js";
import { AreaHeader, Note, SearchBox } from "./ui.js";
import { Thumb, builtInScene, userScene } from "./WidgetsGallery.js";
import { insertComposition } from "../compositions.js";
import { TEMPLATES } from "@anivo/schema";
import { newFromTemplate } from "../files.js";
import { withErrors } from "../notify.js";
import { TemplateThumb } from "./TemplateGallery.js";

/** The drag data type for a library item dropped on the canvas. */
export const LIBRARY_MIME = "application/x-anivo-library";
export type LibraryDrop = { kind: "widget"; name: string } | { kind: "my-widget"; id: string } | { kind: "composition"; id: string };

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", minHeight: 0, height: "100%", backgroundColor: "var(--ui-list)", color: "var(--ui-text)", fontSize: "12px" },
  body: { overflowY: "auto", minHeight: 0, flexGrow: 1, padding: "4px 8px 12px" },
  head: { fontSize: "11px", fontWeight: 600, color: "var(--ui-muted)", margin: "10px 0 6px", display: "flex", justifyContent: "space-between" },
  grid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px" },
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "5px",
    border: "none",
    borderRadius: "6px",
    backgroundColor: "var(--ui-widget)",
    color: "var(--ui-text)",
    font: "inherit",
    fontSize: "11px",
    textAlign: "left",
    cursor: "grab",
    overflow: "hidden",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
  },
  name: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
});

function DragTile({ label, title, drop, onClick, children }: { label: string; title?: string; drop: LibraryDrop; onClick: () => void; children: React.ReactNode }) {
  const s = useStyles();
  return (
    <button
      type="button"
      className={s.tile}
      title={title ?? `${label}: click to insert, or drag onto the canvas`}
      aria-label={`Library: ${label}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(LIBRARY_MIME, JSON.stringify(drop));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onClick}
    >
      {children}
      <span className={s.name}>{label}</span>
    </button>
  );
}

export function LibraryPanel() {
  const s = useStyles();
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState<UserWidget[]>([]);
  const [comps, setComps] = useState<Composition[]>([]);
  const [presets, setPresets] = useState<MotionPreset[]>([]);
  const [looks, setLooks] = useState<StylePreset[]>([]);
  const version = useEditor((st) => st.libraryVersion);
  const theme = useEditor((st) => `${st.scene.settings.theme}|${st.scene.settings.style}`);
  useEffect(() => {
    void listUserWidgets().then(setMine);
    void listCompositions().then(setComps);
    void listUserPresets().then(setPresets);
    void listUserStyles().then(setLooks);
  }, [version]);
  const q = query.trim().toLowerCase();
  const has = (...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q));
  const widgets = WIDGETS.filter((w) => has(w.title, w.name, w.description));
  const myWidgets = mine.filter((w) => has(w.name));
  const compositions = comps.filter((c) => has(c.name));
  const motion = [...allBuiltins(), ...presets].filter((p) => has(p.name, p.description));
  const styles = [...builtinStyles(), ...looks].filter((p) => has(p.name));
  const templates = TEMPLATES.filter((t) => has(t.title, t.name, t.description));
  const none = widgets.length + myWidgets.length + compositions.length + motion.length + styles.length + templates.length === 0;
  return (
    <section className={s.root} aria-label="Library">
      <AreaHeader title="Library">
        <SearchBox label="Search the library" value={query} onChange={setQuery} />
      </AreaHeader>
      <div className={s.body} key={theme}>
        {none && <Note>Nothing matches "{query}".</Note>}
        {compositions.length > 0 && (
          <>
            <div className={s.head}>Compositions</div>
            <div className={s.grid}>
              {compositions.map((c) => (
                <DragTile key={c.id} label={c.name} drop={{ kind: "composition", id: c.id }} onClick={() => insertComposition(c)}>
                  <CompositionPreview c={c} />
                </DragTile>
              ))}
            </div>
          </>
        )}
        {(widgets.length > 0 || myWidgets.length > 0) && <div className={s.head}>Widgets</div>}
        <div className={s.grid}>
          {myWidgets.map((w) => (
            <DragTile key={w.id} label={w.name} drop={{ kind: "my-widget", id: w.id }} onClick={() => insertUserWidget(w)}>
              <Thumb make={() => userScene(w)} />
            </DragTile>
          ))}
          {widgets.map((w) => (
            <DragTile key={w.name} label={w.title} title={w.description} drop={{ kind: "widget", name: w.name }} onClick={() => insertWidget(w)}>
              <Thumb make={() => builtInScene(w.name)} />
            </DragTile>
          ))}
        </div>
        {motion.length > 0 && (
          <>
            <div className={s.head}>
              Motion presets <span>apply to the selection</span>
            </div>
            <div className={s.grid}>
              {motion.map((p) => (
                <PresetTile key={p.id} preset={p} prefix="Library preset" />
              ))}
            </div>
          </>
        )}
        {styles.length > 0 && (
          <>
            <div className={s.head}>
              Styles <span>apply to the selection</span>
            </div>
            <div className={s.grid} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {styles.map((p) => (
                <StyleTile key={p.id} p={p} prefix="Library style" />
              ))}
            </div>
          </>
        )}
        {templates.length > 0 && (
          <>
            <div className={s.head}>
              Templates <span>open as a new scene</span>
            </div>
            <div className={s.grid}>
              {templates.map((t) => (
                <button key={t.name} type="button" className={s.tile} style={{ cursor: "pointer" }} title={t.description} aria-label={`Library template: ${t.title}`} onClick={() => void withErrors(() => newFromTemplate(t.name))}>
                  <TemplateThumb name={t.name} />
                  <span className={s.name}>{t.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Insert a library item that was dropped on the canvas at a scene point. */
export async function dropLibraryItem(data: string, at: { x: number; y: number }): Promise<void> {
  const d = JSON.parse(data) as LibraryDrop;
  if (d.kind === "widget") {
    const def = WIDGETS.find((w) => w.name === d.name);
    if (def) insertWidget(def, at);
  } else if (d.kind === "my-widget") {
    const w = (await listUserWidgets()).find((x) => x.id === d.id);
    if (w) insertUserWidget(w, at);
  } else {
    const c = (await listCompositions()).find((x) => x.id === d.id);
    if (c) insertComposition(c, {}, at);
  }
}
