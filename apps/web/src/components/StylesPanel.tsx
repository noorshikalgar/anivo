/**
 * Styles (docs/21 C12): ready-made and saved looks. Click one to give the
 * selection that look; save the look of the selected element to use it again.
 */
import type { StylePreset } from "@anivo/ops";
import { sceneTheme } from "@anivo/render";
import { Input, makeStyles } from "@fluentui/react-components";
import { Dismiss12Regular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useEditor } from "../store.js";
import { applyLook, builtinStyles, copyLook, deleteUserStyle, listUserStyles, pasteLook, saveLook } from "../styles.js";
import { Btn, Panel } from "./ui.js";

const useStyles = makeStyles({
  grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" },
  tile: { position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "4px", border: "1px solid var(--ui-line)", borderRadius: "6px", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "10px", ":hover": { background: "var(--ui-hover)" } },
  swatch: { width: "100%", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", boxSizing: "border-box" },
  del: { position: "absolute", top: "1px", right: "1px", padding: "0", border: "none", background: "transparent", color: "var(--ui-muted)", cursor: "pointer", lineHeight: 0 },
  row: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" },
});

export function StyleTile({ p, onDelete, prefix = "Style" }: { p: StylePreset; onDelete?: () => void; prefix?: string }) {
  const s = useStyles();
  const scene = useEditor((st) => st.scene);
  const theme = sceneTheme(scene);
  const css = (v: string | undefined, fallback: string) => (v ? (theme.tokens[v] ?? v) : (theme.tokens[fallback] ?? fallback));
  const st = p.style;
  return (
    <button type="button" className={s.tile} aria-label={`${prefix}: ${p.name}`} title={`Give the selection the style '${p.name}'`} onClick={() => applyLook(p.style, p.name)}>
      <span
        className={s.swatch}
        style={{
          background: css(st.fill, theme.defaults.fill),
          border: `${Math.min(st.strokeWidth ?? 1, 3)}px ${st.strokeStyle ?? "solid"} ${css(st.stroke, theme.defaults.stroke)}`,
          borderRadius: Math.min(st.cornerRadius ?? theme.defaults.cornerRadius, 11),
          color: css(st.textColor, theme.defaults.textColor),
          fontWeight: st.fontWeight ?? 400,
          boxShadow: st.shadow === "soft" ? "0 2px 6px rgba(0,0,0,.35)" : st.shadow === "hard" ? "2px 2px 0 rgba(0,0,0,.6)" : undefined,
        }}
      >
        Aa
      </span>
      {p.name}
      {onDelete && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Delete the style ${p.name}`}
          className={s.del}
          onClick={(e) => (e.stopPropagation(), onDelete())}
          onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), onDelete())}
        >
          <Dismiss12Regular />
        </span>
      )}
    </button>
  );
}

export function StylesPanel() {
  const s = useStyles();
  const [mine, setMine] = useState<StylePreset[]>([]);
  const [name, setName] = useState<string | null>(null);
  const reload = () => void listUserStyles().then(setMine);
  useEffect(reload, []);
  return (
    <Panel id="el-styles" title="Styles" defaultOpen={false}>
      <div className={s.grid} role="group" aria-label="Styles">
        {builtinStyles().map((p) => (
          <StyleTile key={p.id} p={p} />
        ))}
        {mine.map((p) => (
          <StyleTile key={p.id} p={p} onDelete={() => void deleteUserStyle(p.id).then(reload)} />
        ))}
      </div>
      {name === null ? (
        <div className={s.row}>
          <Btn onClick={() => setName("")} title="Save the look of the selected element (fill, stroke, corners, font, shadow)">
            Save this style…
          </Btn>
          <Btn onClick={copyLook} title="Copy style (Ctrl+Alt+C)">
            Copy
          </Btn>
          <Btn onClick={pasteLook} title="Paste style (Ctrl+Alt+V)">
            Paste
          </Btn>
        </div>
      ) : (
        <div className={s.row}>
          <Input aria-label="Style name" placeholder="My style" value={name} autoFocus onChange={(_, d) => setName(d.value)} onKeyDown={(e) => e.stopPropagation()} style={{ flex: 1, minWidth: 0 }} />
          <Btn primary onClick={() => void saveLook(name).then((p) => p && (setName(null), reload()))}>
            Save
          </Btn>
          <Btn onClick={() => setName(null)}>Cancel</Btn>
        </div>
      )}
    </Panel>
  );
}
