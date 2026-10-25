/**
 * The step tree (docs/15): Base, the steps, and the actions of each step.
 * Click a step to select it; click the arrow to show its actions. Drag a step
 * to change the order.
 */
import { Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, makeStyles, mergeClasses } from "@fluentui/react-components";
import { Add16Regular, ArrowDown16Regular, ArrowUp16Regular, ChevronDown12Filled, ChevronRight12Filled, Copy16Regular, Delete16Regular, Image16Regular, Library16Regular, MoreHorizontal16Regular } from "@fluentui/react-icons";
import { type Ctx2D, renderScene } from "@anivo/render";
import { useEffect, useRef, useState } from "react";
import { addStep, deleteStep, duplicateStep, moveStep } from "../commands.js";
import { useEditor } from "../store.js";
import { formatTime } from "./PlaybackBar.js";
import { describe } from "./StepInspector.js";
import { actionIcon } from "./typeIcons.js";
import { AreaHeader, IconButton, MenuButtonSmall, SearchBox } from "./ui.js";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", minHeight: 0, backgroundColor: "var(--ui-list)", color: "var(--ui-text)", fontSize: "12px" },
  tree: { overflowY: "auto", minHeight: 0, flexGrow: 1, padding: "2px 0 8px" },
  row: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    height: "22px",
    paddingRight: "2px",
    ":hover": { backgroundColor: "var(--ui-hover)" },
    ":hover .step-more": { opacity: 1 },
  },
  alt: { backgroundColor: "var(--ui-list-alt)" },
  selected: { backgroundColor: "var(--ui-row-selected) !important", "--ui-muted": "var(--ui-muted-on-select)" } as never,
  dropBefore: { boxShadow: "inset 0 2px 0 var(--ui-select)" },
  disclose: { width: "16px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", color: "var(--ui-muted)", padding: 0, cursor: "pointer", flexShrink: 0 },
  item: {
    flexGrow: 1,
    minWidth: 0,
    height: "22px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "0 4px 0 0",
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    ":focus-visible": { outline: "1px solid var(--ui-select)", outlineOffset: "-1px" },
  },
  index: { minWidth: "18px", height: "16px", padding: "0 3px", borderRadius: "3px", backgroundColor: "var(--ui-widget)", color: "var(--ui-text)", fontSize: "10px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums", flexShrink: 0 },
  title: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { color: "var(--ui-muted)", fontSize: "11px", fontVariantNumeric: "tabular-nums", flexShrink: 0 },
  icon: { display: "flex", color: "var(--ui-muted)", flexShrink: 0 },
  child: { paddingLeft: "34px" },
  childActive: { color: "var(--ui-text)" },
  more: { opacity: 0 },
  rowThumb: { height: "44px" },
  metaLine: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  stack: { flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px", lineHeight: "15px" },
  itemThumb: { height: "44px" },
  thumb: { width: "64px", height: "36px", borderRadius: "3px", flexShrink: 0, backgroundColor: "var(--ui-viewport)", outline: "1px solid var(--ui-line)" },
  empty: { color: "var(--ui-faint)", fontSize: "11px", padding: "6px 10px" },
});

/**
 * A small frame of the end of a step (docs/22 D4). It draws when the editor
 * is idle after a change, so typing and dragging stay smooth.
 */
function StepThumb({ atMs }: { atMs: number }) {
  const s = useStyles();
  const ref = useRef<HTMLCanvasElement>(null);
  const scene = useEditor((st) => st.scene);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const cv = ref.current;
      if (!cv) return;
      cv.width = 128;
      cv.height = Math.round((128 * scene.settings.video.height) / scene.settings.video.width);
      renderScene(cv.getContext("2d") as unknown as Ctx2D, scene, atMs, { width: cv.width, height: cv.height });
    }, 300);
    return () => window.clearTimeout(id);
  }, [scene, atMs]);
  return <canvas ref={ref} className={s.thumb} aria-hidden data-step-thumb />;
}

export function StepsPanel() {
  const s = useStyles();
  const steps = useEditor((st) => st.scene.steps);
  const timeline = useEditor((st) => st.timeline);
  const selected = useEditor((st) => st.selectedStep);
  const activeAction = useEditor((st) => st.activeAction);
  const selectStep = useEditor((st) => st.selectStep);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const thumbs = useEditor((st) => st.stepThumbs);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const q = query.trim().toLowerCase();
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  let row = 0;

  return (
    <nav className={s.root} aria-label="Steps">
      <AreaHeader title="Steps">
        <SearchBox label="Search steps" value={query} onChange={setQuery} />
        <IconButton label={thumbs ? "Hide step frames" : "Show step frames"} pressed={thumbs} icon={<Image16Regular />} onClick={() => useEditor.setState({ stepThumbs: !thumbs })} />
        <IconButton label="Add step (N)" icon={<Add16Regular />} onClick={addStep} />
      </AreaHeader>
      <div className={s.tree} role="tree" aria-label="Step tree">
        {!q && (
          <div className={mergeClasses(s.row, selected === null && s.selected)} role="treeitem" aria-selected={selected === null}>
            <span className={s.disclose} />
            <button className={s.item} onClick={() => selectStep(null)} aria-current={selected === null} aria-label="Start: the elements before anything moves" title="The elements before anything moves: arrange them here">
              <span className={s.index}>0</span>
              <span className={s.title}>Start</span>
              <span className={s.meta}>0:00</span>
            </button>
          </div>
        )}
        {steps.map((step, i) => {
          const t = timeline.steps[i];
          const match = !q || step.title.toLowerCase().includes(q) || step.actions.some((a) => describe(a).toLowerCase().includes(q) || a.targets.some((x) => x.toLowerCase().includes(q)));
          if (!match) return null;
          const expanded = open.has(step.id) || (!!q && step.actions.length > 0);
          row++;
          return (
            <div key={step.id} role="treeitem" aria-selected={selected === step.id} {...(step.actions.length ? { "aria-expanded": expanded } : {})}>
              <div
                className={mergeClasses(s.row, thumbs && s.rowThumb, row % 2 === 0 && s.alt, selected === step.id && s.selected, dropIndex === i && dragId !== step.id && s.dropBefore)}
                draggable
                onDragStart={(e) => {
                  setDragId(step.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setDropIndex(i);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== step.id) {
                    const from = steps.findIndex((x) => x.id === dragId);
                    moveStep(dragId, from < i ? i - 1 : i);
                  }
                  setDragId(null);
                  setDropIndex(null);
                }}
              >
                <button className={s.disclose} tabIndex={-1} aria-hidden onClick={() => toggle(step.id)} disabled={step.actions.length === 0} style={step.actions.length === 0 ? { visibility: "hidden" } : undefined}>
                  {expanded ? <ChevronDown12Filled /> : <ChevronRight12Filled />}
                </button>
                <button
                  className={mergeClasses(s.item, thumbs && s.itemThumb)}
                  onClick={() => selectStep(step.id)}
                  onDoubleClick={() => toggle(step.id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" && !expanded) toggle(step.id);
                    else if (e.key === "ArrowLeft" && expanded) toggle(step.id);
                  }}
                  aria-current={selected === step.id}
                  aria-label={`Step ${i + 1}: ${step.title || step.id}`}
                  title={`${step.actions.length} ${step.actions.length === 1 ? "action" : "actions"}`}
                >
                  <span className={s.index}>{i + 1}</span>
                  {thumbs && t && <StepThumb atMs={Math.max(t.startMs, t.holdEndMs - 1)} />}
                  {thumbs ? (
                    <span className={s.stack}>
                      <span className={s.title}>{step.title || step.id}</span>
                      <span className={mergeClasses(s.meta, s.metaLine)}>{t ? `${formatTime(t.startMs)} · ${step.actions.length} action${step.actions.length === 1 ? "" : "s"}` : ""}</span>
                    </span>
                  ) : (
                    <>
                      <span className={s.title}>{step.title || step.id}</span>
                      <span className={s.meta}>{t ? formatTime(t.startMs) : ""}</span>
                    </>
                  )}
                </button>
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <MenuButtonSmall className={mergeClasses(s.more, "step-more")} iconOnly icon={<MoreHorizontal16Regular />} aria-label={`More for step ${i + 1}`} />
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem icon={<Copy16Regular />} onClick={() => duplicateStep(step.id)}>
                        Duplicate
                      </MenuItem>
                      <MenuItem
                        icon={<Library16Regular />}
                        disabled={step.actions.length === 0}
                        onClick={() => {
                          // The elements that the step animates become the selection; the dialog saves them with their animations.
                          const ids = [...new Set(step.actions.flatMap((a) => a.targets))].filter((id) => id in useEditor.getState().scene.elements && useEditor.getState().scene.elements[id]!.type !== "connector");
                          useEditor.getState().setSelection(ids);
                          useEditor.setState({ compositionsOpen: true });
                        }}
                      >
                        Save as composition…
                      </MenuItem>
                      <MenuItem icon={<ArrowUp16Regular />} disabled={i === 0} onClick={() => moveStep(step.id, i - 1)}>
                        Move up
                      </MenuItem>
                      <MenuItem icon={<ArrowDown16Regular />} disabled={i === steps.length - 1} onClick={() => moveStep(step.id, i + 1)}>
                        Move down
                      </MenuItem>
                      <MenuItem icon={<Delete16Regular />} onClick={() => deleteStep(step.id)}>
                        Delete
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </div>
              {expanded && (
                <div role="group">
                  {step.actions.map((a) => {
                    row++;
                    const on = selected === step.id && activeAction === a.id;
                    return (
                      <div key={a.id} role="treeitem" aria-selected={on} className={mergeClasses(s.row, row % 2 === 0 && s.alt, on && s.selected)}>
                        <button
                          className={mergeClasses(s.item, s.child)}
                          onClick={() => {
                            if (selected !== step.id) selectStep(step.id);
                            useEditor.setState({ activeAction: a.id, selection: [] });
                          }}
                        >
                          <span className={s.icon}>{actionIcon(a.type)}</span>
                          <span className={s.title}>{describe(a)}</span>
                          <span className={s.meta}>{a.targets.length > 1 ? `${a.targets.length}` : (a.targets[0] ?? "")}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {steps.length === 0 && <div className={s.empty}>Steps are the chapters of your video, with a title and a caption. You do not need one to start: add an animation, and Anivo makes Step 1.</div>}
        {steps.length > 0 && q && row === 0 && <div className={s.empty}>No step matches.</div>}
      </div>
    </nav>
  );
}
