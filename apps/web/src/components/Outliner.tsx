/**
 * The outliner (docs/15): a tree of the elements, front first. Click selects
 * (Shift or Ctrl adds), double-click renames. The eye hides an element in the
 * editor; the lock stops changes on the canvas.
 */
import type { Element } from "@anivo/schema";
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { ChevronDown12Filled, ChevronRight12Filled, Eye16Regular, EyeOff16Regular, LockClosed16Regular, LockOpen16Regular } from "@fluentui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { renameElement } from "../commands.js";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";
import { elementIcon } from "./typeIcons.js";
import { AreaHeader, IconButton, SearchBox } from "./ui.js";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", minHeight: 0, backgroundColor: "var(--ui-list)", color: "var(--ui-text)", fontSize: "12px" },
  tree: { overflowY: "auto", minHeight: 0, flexGrow: 1, padding: "2px 0 6px" },
  row: { display: "flex", alignItems: "center", height: "22px", paddingRight: "2px", cursor: "default", ":hover": { backgroundColor: "var(--ui-hover)" } },
  alt: { backgroundColor: "var(--ui-list-alt)" },
  selected: { backgroundColor: "var(--ui-row-selected) !important", "--ui-muted": "var(--ui-muted-on-select)" } as never,
  disclose: { width: "16px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", color: "var(--ui-muted)", padding: 0, cursor: "pointer", flexShrink: 0 },
  name: { flexGrow: 1, flexShrink: 1, minWidth: 0, overflow: "hidden", display: "flex", alignItems: "center", gap: "6px", height: "22px", border: "none", background: "none", color: "inherit", font: "inherit", textAlign: "left", padding: 0, cursor: "pointer", ":focus-visible": { outline: "1px solid var(--ui-select)", outlineOffset: "-1px" } },
  icon: { display: "flex", color: "var(--ui-muted)", flexShrink: 0 },
  text: { minWidth: 0, flexShrink: 0, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  label: { minWidth: 0, flexShrink: 1, color: "var(--ui-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px" },
  hidden: { opacity: 0.45 },
  rename: { flexGrow: 1, minWidth: 0, height: "18px", border: "1px solid var(--ui-select)", borderRadius: "3px", backgroundColor: "var(--ui-field)", color: "var(--ui-text)", font: "inherit", fontSize: "12px", padding: "0 4px", outline: "none" },
  empty: { color: "var(--ui-faint)", fontSize: "11px", padding: "6px 10px" },
});

function labelOf(el: Element): string {
  if (el.type === "text") return el.content.text.split("\n")[0] ?? "";
  if (el.type === "icon") return `${el.pack}:${el.name}`;
  return el.label?.text.split("\n")[0] ?? "";
}

export function Outliner() {
  const s = useStyles();
  const elements = useEditor((st) => st.scene.elements);
  const selection = useEditor((st) => st.selection);
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const tree = useRef<HTMLDivElement>(null);
  // The selected element shows in the tree.
  useEffect(() => {
    tree.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selection]);

  // Children of each parent, front (high z) first.
  const children = useMemo(() => {
    const m = new Map<string | undefined, Element[]>();
    for (const el of Object.values(elements)) {
      const p = el.parentId;
      const list = m.get(p) ?? [];
      list.push(el);
      m.set(p, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.z < b.z ? 1 : a.z > b.z ? -1 : a.id.localeCompare(b.id)));
    return m;
  }, [elements]);

  const select = (id: string, e: React.MouseEvent) => {
    const st = useEditor.getState();
    if (e.shiftKey || e.ctrlKey || e.metaKey) st.setSelection(st.selection.includes(id) ? st.selection.filter((x) => x !== id) : [...st.selection, id]);
    else st.setSelection([id]);
  };
  const set = (el: Element, changes: Record<string, unknown>, label: string) => useEditor.getState().apply({ label, ops: [{ op: "element.update", id: el.id, set: changes }] });

  const rows: React.ReactElement[] = [];
  const visit = (el: Element, depth: number) => {
    const kids = children.get(el.id) ?? [];
    const text = labelOf(el);
    const match = !q || el.id.toLowerCase().includes(q) || text.toLowerCase().includes(q);
    const open = !closed.has(el.id) || !!q;
    if (match) {
      const on = selection.includes(el.id);
      rows.push(
        <div key={el.id} role="treeitem" aria-selected={on} {...(kids.length ? { "aria-expanded": open } : {})} className={mergeClasses(s.row, rows.length % 2 === 1 && s.alt, on && s.selected)} style={{ paddingLeft: `${depth * 14}px` }}>
          <button
            className={s.disclose}
            tabIndex={-1}
            aria-hidden
            style={kids.length ? undefined : { visibility: "hidden" }}
            onClick={() =>
              setClosed((c) => {
                const n = new Set(c);
                if (n.has(el.id)) n.delete(el.id);
                else n.add(el.id);
                return n;
              })
            }
          >
            {open ? <ChevronDown12Filled /> : <ChevronRight12Filled />}
          </button>
          {renaming === el.id ? (
            <input
              className={s.rename}
              autoFocus
              defaultValue={el.id}
              aria-label={`New ID for ${el.id}`}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "Escape") setRenaming(null);
              }}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                setRenaming(null);
                if (v && v !== el.id) {
                  const err = renameElement(el.id, v);
                  if (err) notify(err, "error");
                }
              }}
            />
          ) : (
            <button className={mergeClasses(s.name, el.editorHidden && s.hidden)} onClick={(e) => select(el.id, e)} onDoubleClick={() => setRenaming(el.id)} aria-label={el.id} title={`${el.type}${text ? `: ${text}` : ""} (double-click to rename)`}>
              <span className={s.icon}>{elementIcon(el.type)}</span>
              <span className={s.text}>{el.id}</span>
              {text && text !== el.id && <span className={s.label}>{text}</span>}
            </button>
          )}
          <IconButton label={el.editorHidden ? `Show ${el.id} in the editor` : `Hide ${el.id} in the editor`} pressed={!el.editorHidden} icon={<Eye16Regular />} offIcon={<EyeOff16Regular />} onClick={() => set(el, { editorHidden: !el.editorHidden }, el.editorHidden ? "Show in editor" : "Hide in editor")} />
          <IconButton label={el.locked ? `Unlock ${el.id}` : `Lock ${el.id}`} pressed={el.locked} icon={<LockClosed16Regular />} offIcon={<LockOpen16Regular />} onClick={() => set(el, { locked: !el.locked }, el.locked ? "Unlock" : "Lock")} />
        </div>,
      );
    }
    if (open || q) for (const k of kids) visit(k, depth + 1);
  };
  for (const el of children.get(undefined) ?? []) visit(el, 0);

  return (
    <section className={s.root} aria-label="Outliner">
      <AreaHeader title="Outliner">
        <SearchBox label="Search elements" value={query} onChange={setQuery} />
      </AreaHeader>
      <div ref={tree} className={s.tree} role="tree" aria-label="Elements" aria-multiselectable>
        {rows}
        {rows.length === 0 && <div className={s.empty}>{q ? "No element matches." : "No elements. Draw with the tools on the left."}</div>}
      </div>
    </section>
  );
}
