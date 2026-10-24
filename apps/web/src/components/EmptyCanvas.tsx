/**
 * The first thing a new scene shows: what to do first (docs/23 U1). It goes
 * away when the scene has an element.
 */
import { makeStyles } from "@fluentui/react-components";
import { useEditor } from "../store.js";
import { Btn } from "./ui.js";

const useStyles = makeStyles({
  root: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "18px 22px", borderRadius: "10px", backgroundColor: "var(--ui-panel)", color: "var(--ui-text)", boxShadow: "0 8px 30px rgba(0,0,0,.35)", zIndex: 4, maxWidth: "420px", textAlign: "center" },
  title: { fontSize: "15px", fontWeight: 600 },
  note: { fontSize: "12px", color: "var(--ui-muted)", lineHeight: "17px" },
  row: { display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" },
});

export function EmptyCanvas() {
  const s = useStyles();
  // It hides while a drawing tool is on, so the card does not take the first drag.
  const empty = useEditor((st) => Object.keys(st.scene.elements).length === 0 && st.screen === "editor" && st.tool === "select");
  if (!empty) return null;
  return (
    <div className={s.root} role="note" aria-label="Start here" onPointerDown={(e) => e.stopPropagation()}>
      <div className={s.title}>Start your scene</div>
      <div className={s.note}>Draw a shape, drop a ready-made part from the Library, or write the scene as a script. Then add steps (N) to animate it.</div>
      <div className={s.row}>
        <Btn primary onClick={() => useEditor.getState().setTool("rectangle")}>Draw a box (R)</Btn>
        <Btn onClick={() => useEditor.setState({ leftTab: "library" })}>Open the Library</Btn>
        <Btn onClick={() => useEditor.setState({ scriptOpen: true })}>Write a script…</Btn>
      </div>
    </div>
  );
}
