/**
 * The Actions tab (docs/15, docs/06): what moves in the selected step.
 *
 * 1. Choose the step (arrows or the list), and play it.
 * 2. Add an action with a quick button. The action uses the selected
 *    elements; with no selection, a list of the elements opens.
 * 3. The sequence shows each action with its targets and a bar for its
 *    time in the step.
 * 4. The active action has three panels: What (the effect), Who (the
 *    targets), and When (the timing and the sound).
 */
import { captionTiming, easingFn } from "@anivo/engine";
import { type Action, DEFAULT_EASING, type Element, type Step } from "@anivo/schema";
import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, makeStyles } from "@fluentui/react-components";
import {
  Add16Regular,
  ArrowLeft16Regular,
  ArrowRight16Regular,
  ChevronDown16Regular,
  ChevronUp16Regular,
  Delete16Regular,
  Dismiss12Regular,
  MoreHorizontal16Regular,
  Play16Regular,
  Search16Regular,
  SplitVertical16Regular,
  Subtract16Regular,
  Target16Regular,
} from "@fluentui/react-icons";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { addAction, addMotionAlongArrow, addStep, canSplitAction, moveAction, removeAction, splitAction, updateAction, updateStep } from "../commands.js";
import { useEditor } from "../store.js";
import { Select, SelectField, TextField } from "./fields.js";
import { formatTime } from "./PlaybackBar.js";
import { ActionEditor, AddActionMenu, describe } from "./StepInspector.js";
import { actionIcon, elementIcon } from "./typeIcons.js";
import { Btn, IconButton, ListSideGap, ListView, MenuButtonSmall, Note, Panel, Prop } from "./ui.js";

const useStyles = makeStyles({
  stepBar: { display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  quick: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(62px, 1fr))", gap: "2px" },
  tile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "2px",
    height: "40px",
    border: "none",
    borderRadius: "4px",
    backgroundColor: "var(--ui-widget)",
    color: "var(--ui-text)",
    font: "inherit",
    fontSize: "11px",
    cursor: "pointer",
    padding: "2px",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
    ":disabled": { opacity: 0.4, cursor: "default" },
  },
  tileIcon: { display: "flex", color: "var(--ui-text)" },
  bar: { position: "relative", width: "44px", height: "8px", borderRadius: "2px", backgroundColor: "var(--ui-widget)", flexShrink: 0, overflow: "hidden" },
  barFill: { position: "absolute", top: 0, bottom: 0, backgroundColor: "var(--ui-select)", borderRadius: "2px", minWidth: "2px" },
  chips: { display: "flex", flexWrap: "wrap", gap: "3px" },
  chip: { display: "inline-flex", alignItems: "center", gap: "4px", height: "20px", padding: "0 2px 0 6px", borderRadius: "10px", backgroundColor: "var(--ui-widget)", fontSize: "11px", color: "var(--ui-text)" },
  chipX: { display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", border: "none", borderRadius: "8px", background: "none", color: "var(--ui-muted)", cursor: "pointer", padding: 0, ":hover": { backgroundColor: "var(--ui-hover)", color: "var(--ui-text)" } },
  row: { display: "flex", gap: "3px", flexWrap: "wrap" },
  curve: { display: "block", backgroundColor: "var(--ui-field)", borderRadius: "4px" },
  empty: { display: "flex", flexDirection: "column", gap: "8px", padding: "12px 8px", color: "var(--ui-muted)", fontSize: "12px", lineHeight: "17px" },
  stepList: { display: "flex", flexDirection: "column", gap: "2px" },
  // Target picker
  search: { display: "flex", alignItems: "center", gap: "6px", height: "26px", padding: "0 8px", borderRadius: "4px", backgroundColor: "var(--ui-field)", color: "var(--ui-muted)" },
  searchInput: { flexGrow: 1, minWidth: 0, border: "none", outline: "none", background: "none", color: "var(--ui-text)", font: "inherit", fontSize: "12px" },
  pickList: { marginTop: "6px", maxHeight: "320px", overflowY: "auto", backgroundColor: "var(--ui-list)", borderRadius: "4px", padding: "2px 0" },
  pickRow: { display: "flex", alignItems: "center", gap: "8px", height: "26px", padding: "0 8px", fontSize: "12px", cursor: "pointer", ":hover": { backgroundColor: "var(--ui-hover)" } },
  pickLabel: { color: "var(--ui-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px" },
});

/** Quick actions: the common choices, one click each. */
interface Quick {
  label: string;
  hint: string;
  icon: ReactElement;
  action: Record<string, unknown>;
  /** Element types that the action can use. Omit for all. */
  only?: Element["type"][];
}

const QUICK: Quick[] = [
  { label: "Appear", hint: "Pop in (enter · pop)", icon: actionIcon("enter"), action: { type: "enter", effect: "pop" } },
  { label: "Fade in", hint: "Fade in (enter · fade)", icon: actionIcon("enter"), action: { type: "enter", effect: "fade" } },
  { label: "Draw", hint: "Draw the line (enter · draw-on), for arrows and shapes", icon: actionIcon("enter"), action: { type: "enter", effect: "draw-on" } },
  { label: "Type", hint: "Type the text (enter · typewriter)", icon: actionIcon("enter"), action: { type: "enter", effect: "typewriter" }, only: ["text", "rectangle", "ellipse", "diamond", "code"] },
  { label: "Disappear", hint: "Fade out (exit · fade)", icon: actionIcon("exit"), action: { type: "exit", effect: "fade" } },
  { label: "Pulse", hint: "Pulse to point at it (emphasis · pulse)", icon: actionIcon("emphasis"), action: { type: "emphasis", effect: "pulse" } },
  { label: "Glow", hint: "Glow (emphasis · glow)", icon: actionIcon("emphasis"), action: { type: "emphasis", effect: "glow" } },
  { label: "Focus", hint: "Dim the rest (emphasis · focus)", icon: actionIcon("emphasis"), action: { type: "emphasis", effect: "focus" } },
  { label: "Send", hint: "Move elements along an arrow, for example a message (2.4 s). Select the elements and the arrow.", icon: actionIcon("motion"), action: { type: "motion" } },
  { label: "Flow", hint: "Particles move along the arrows (flow)", icon: actionIcon("flow"), action: { type: "flow", flow: {} }, only: ["connector"] },
  { label: "Zoom", hint: "The camera zooms to the elements (camera · zoom-to)", icon: actionIcon("camera"), action: { type: "camera", camera: { op: "zoom-to" } } },
  { label: "Count", hint: "Count a number up (count)", icon: actionIcon("counter"), action: { type: "counter", counter: { from: 0, to: 100 } }, only: ["text"] },
];

function labelOf(el: Element): string {
  if (el.type === "text") return el.content.text.split("\n")[0] ?? "";
  if (el.type === "icon") return `${el.pack}:${el.name}`;
  return el.label?.text.split("\n")[0] ?? "";
}

/** A dialog with all elements and check boxes. */
function TargetPicker({ open, title, initial, only, onDone }: { open: boolean; title: string; initial: string[]; only?: Element["type"][]; onDone: (ids: string[] | null) => void }) {
  const s = useStyles();
  const elements = useEditor((st) => st.scene.elements);
  const selection = useEditor((st) => st.selection);
  const [picked, setPicked] = useState<string[]>(initial);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) {
      setPicked(initial);
      setQ("");
    }
  }, [open]);
  const list = useMemo(
    () =>
      Object.values(elements)
        .filter((e) => e.type !== "group" || !only)
        .filter((e) => !only || only.includes(e.type))
        .filter((e) => !q.trim() || e.id.includes(q.trim().toLowerCase()) || labelOf(e).toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [elements, only, q],
  );
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onDone(null)}>
      <DialogSurface aria-label={title} style={{ maxWidth: "420px" }}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <div className={s.search}>
              <Search16Regular />
              <input className={s.searchInput} autoFocus placeholder="Search elements" aria-label="Search elements" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            </div>
            <div className={s.pickList} role="group" aria-label="Elements">
              {list.map((e) => (
                <label key={e.id} className={s.pickRow}>
                  <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} />
                  <span style={{ display: "flex", color: "var(--ui-muted)" }}>{elementIcon(e.type)}</span>
                  <span>{e.id}</span>
                  <span className={s.pickLabel}>{labelOf(e)}</span>
                </label>
              ))}
              {list.length === 0 && <div style={{ padding: 8, color: "var(--ui-muted)" }}>{only ? `No element of this kind (${only.join(", ")}).` : "No elements."}</div>}
            </div>
          </DialogContent>
          <DialogActions>
            <Btn onClick={() => setPicked(selection.filter((id) => !only || only.includes(elements[id]?.type as Element["type"])))} disabled={selection.length === 0}>
              Use the selection
            </Btn>
            <Btn onClick={() => onDone(null)}>Cancel</Btn>
            <Btn primary onClick={() => onDone(picked)} disabled={picked.length === 0}>
              {`Use ${picked.length} ${picked.length === 1 ? "element" : "elements"}`}
            </Btn>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** A small picture of the easing curve. */
function EasingCurve({ action }: { action: Action }) {
  const s = useStyles();
  const fn = easingFn(action.easing ?? DEFAULT_EASING[action.type]);
  const pts = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    return `${(4 + t * 72).toFixed(1)},${(30 - fn(t) * 22).toFixed(1)}`;
  }).join(" ");
  return (
    <svg className={s.curve} width="80" height="36" viewBox="0 0 80 36" aria-hidden>
      <line x1="4" y1="30" x2="76" y2="30" stroke="var(--ui-outline)" />
      <line x1="4" y1="8" x2="76" y2="8" stroke="var(--ui-outline)" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke="var(--ui-select)" strokeWidth="2" />
    </svg>
  );
}

/** Play one step from its start, and stop at its end. */
function playStep(stepId: string): void {
  const st = useEditor.getState();
  const t = st.timeline.steps.find((x) => x.id === stepId);
  if (!t) return;
  st.selectStep(stepId);
  st.setPlayhead(t.startMs);
  st.play();
  const watch = () => {
    const s = useEditor.getState();
    if (!s.playing) return;
    if (s.playhead >= t.holdEndMs) {
      s.pause();
      s.setPlayhead(t.endMs);
      return;
    }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
}

export function ActionsPanel() {
  const s = useStyles();
  const steps = useEditor((st) => st.scene.steps);
  const selectedStep = useEditor((st) => st.selectedStep);
  const step = steps.find((x) => x.id === selectedStep);
  const index = step ? steps.indexOf(step) : -1;

  if (steps.length === 0) {
    return (
      <div className={s.empty}>
        <span>Actions make elements move. They belong to steps. Add a step first.</span>
        <Btn primary icon={<Add16Regular />} onClick={addStep}>
          Add step
        </Btn>
      </div>
    );
  }
  return (
    <>
      <div className={s.stepBar}>
        <IconButton label="Previous step" icon={<ArrowLeft16Regular />} disabled={index <= 0} onClick={() => useEditor.getState().selectStep(steps[index - 1]!.id)} />
        <div className={s.grow}>
          <Select
            label="Step"
            value={selectedStep ?? "base"}
            options={[{ value: "base", text: "Base (no actions)" }, ...steps.map((x, i) => ({ value: x.id, text: `${i + 1}. ${x.title || x.id}` }))]}
            onCommit={(v) => useEditor.getState().selectStep(v === "base" ? null : v)}
          />
        </div>
        <IconButton label="Next step" icon={<ArrowRight16Regular />} disabled={index >= steps.length - 1} onClick={() => useEditor.getState().selectStep(steps[index + 1]!.id)} />
        <IconButton label="Play this step" icon={<Play16Regular />} disabled={!step} onClick={() => step && playStep(step.id)} />
      </div>
      {step ? (
        <StepActions key={step.id} step={step} />
      ) : (
        <div className={s.empty}>
          <span>Base is the picture before step 1. It has no actions. Choose the step to animate:</span>
          <div className={s.stepList}>
            {steps.map((x, i) => (
              <Btn key={x.id} onClick={() => useEditor.getState().selectStep(x.id)}>
                {`${i + 1}. ${x.title || x.id} (${x.actions.length})`}
              </Btn>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function StepActions({ step }: { step: Step }) {
  const s = useStyles();
  const timed = useEditor((st) => st.timeline.steps.find((x) => x.id === step.id));
  const elements = useEditor((st) => st.scene.elements);
  const selection = useEditor((st) => st.selection);
  const activeId = useEditor((st) => st.activeAction);
  const setActive = (id: string | null) => useEditor.setState({ activeAction: id });
  const [picker, setPicker] = useState<{ title: string; only?: Element["type"][]; initial: string[]; done: (ids: string[]) => void } | null>(null);
  const active = step.actions.find((a) => a.id === activeId) ?? step.actions[0];
  const index = active ? step.actions.indexOf(active) : -1;

  // A new action becomes the active one.
  const ids = step.actions.map((a) => a.id);
  const [known, setKnown] = useState(ids);
  useEffect(() => {
    const added = ids.find((id) => !known.includes(id));
    if (added) setActive(added);
    else if (!ids.includes(activeId ?? "")) setActive(ids[0] ?? null);
    setKnown(ids);
  }, [ids.join(",")]);
  // The canvas marks the targets of the active action.
  const targets = active?.targets.join(",") ?? "";
  useEffect(() => {
    useEditor.setState({ targetHighlight: active?.targets ?? [] });
    return () => useEditor.setState({ targetHighlight: [] });
  }, [targets]);

  const span = timed ? Math.max(1, timed.holdEndMs - timed.startMs) : 1;
  const barOf = (a: Action) => {
    const parts = timed?.actions.filter((x) => x.action.id === a.id) ?? [];
    if (!timed || parts.length === 0) return null;
    const from = Math.min(...parts.map((p) => p.startMs)) - timed.startMs;
    const to = Math.max(...parts.map((p) => p.endMs)) - timed.startMs;
    return (
      <span className={s.bar} title={`${formatTime(from)} to ${formatTime(to)} in the step`} aria-hidden>
        <span className={s.barFill} style={{ left: `${(from / span) * 100}%`, width: `${((to - from) / span) * 100}%` }} />
      </span>
    );
  };

  const quickAdd = (q: Quick) => {
    if (q.label === "Send") {
      // Send: the elements and one arrow. Ask for what is not selected.
      const arrow = selection.find((id) => elements[id]?.type === "connector");
      const movers = selection.filter((id) => elements[id] && elements[id]!.type !== "connector");
      const withArrow = (ids: string[]) => {
        if (arrow) return void addMotionAlongArrow(ids, arrow);
        setPicker({ title: "Send: choose the arrow", only: ["connector"], initial: [], done: (cs) => cs[0] && void addMotionAlongArrow(ids, cs[0]) });
      };
      if (movers.length > 0) withArrow(movers);
      else setPicker({ title: "Send: choose the elements that move", initial: [], done: (ids) => ids.length > 0 && withArrow(ids.filter((id) => elements[id]?.type !== "connector")) });
      return;
    }
    const fit = (ids: string[]) => ids.filter((id) => !q.only || q.only.includes(elements[id]?.type as Element["type"]));
    const add = (ids: string[]) => {
      const action = q.action["type"] === "camera" || ids.length > 0 ? { ...q.action, targets: ids, ...(q.action["type"] === "flow" && ids.length > 1 ? { flow: { distribute: "round-robin" } } : {}) } : null;
      if (action) addAction(action, `Add ${q.label.toLowerCase()}`);
    };
    const ids = fit(selection);
    if (ids.length > 0) add(ids);
    else setPicker({ title: `${q.label}: choose the elements`, ...(q.only ? { only: q.only } : {}), initial: [], done: add });
  };

  const cap = step.caption;
  const setCaption = (c: Step["caption"] | null, label: string, mergeKey?: string) => updateStep(step.id, { caption: c }, label, mergeKey);
  const anchorOptions = [{ value: "", text: "Auto (first target)" }, ...Object.values(elements).filter((e) => e.type !== "connector" && e.type !== "group").map((e) => ({ value: e.id, text: e.id }))];

  return (
    <>
      <Panel id="act-caption" title="Caption">
        <TextField
          label="Caption"
          multiline
          placeholder="One sentence: what happens in this step"
          value={cap?.text ?? ""}
          onCommit={(v) => {
            const text = v.trim();
            setCaption(text ? { side: "auto", ...(cap ?? {}), text } : null, text ? "Change caption" : "Remove caption");
            return undefined;
          }}
        />
        {cap && (
          <>
            <SelectField label="Next to" value={cap.anchor ?? ""} options={anchorOptions} onCommit={(v) => {
                const rest = { ...cap };
                delete rest.anchor;
                setCaption(v ? { ...rest, anchor: v } : rest, "Change caption place");
              }} />
            <SelectField
              label="Side"
              value={cap.side}
              options={[
                { value: "auto", text: "Auto (covers the least)" },
                { value: "below", text: "Below" },
                { value: "above", text: "Above" },
                { value: "right", text: "Right" },
                { value: "left", text: "Left" },
                { value: "top", text: "Top of the frame" },
                { value: "bottom", text: "Bottom of the frame" },
              ]}
              onCommit={(v) => setCaption({ ...cap, side: v as NonNullable<Step["caption"]>["side"] }, "Change caption place")}
            />
            <Note>The caption types in at the step start. The step holds for {Math.round(captionTiming(cap.text).typeMs / 100 + captionTiming(cap.text).readMs / 100) / 10} s so that viewers can read it.</Note>
          </>
        )}
      </Panel>
      <Panel id="act-add" title="Add an action">
        <div className={s.quick} role="group" aria-label="Quick actions">
          {QUICK.map((q) => (
            <button key={q.label} type="button" className={s.tile} title={q.hint} onClick={() => quickAdd(q)}>
              <span className={s.tileIcon}>{q.icon}</span>
              {q.label}
            </button>
          ))}
        </div>
        <Note>{selection.length > 0 ? `For the selection: ${selection.length === 1 ? selection[0] : `${selection.length} elements`}.` : "No selection: choose the elements after the click."}</Note>
      </Panel>

      <Panel id="act-sequence" title={`Sequence (${step.actions.length})`}>
        <ListView
          label="Actions"
          items={step.actions.map((a) => ({
            id: a.id,
            icon: actionIcon(a.type),
            text: describe(a),
            meta: a.targets.length === 1 ? a.targets[0] : a.targets.length ? `×${a.targets.length}` : "",
            end: barOf(a),
          }))}
          active={active?.id ?? null}
          onActivate={setActive}
          empty="No actions yet. Click a quick action above."
          onRowKey={(id, e) => {
            if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              removeAction(step.id, id);
            }
          }}
          side={
            <>
              <AddActionMenu iconOnly />
              <IconButton label="Remove action" icon={<Subtract16Regular />} disabled={!active} onClick={() => active && removeAction(step.id, active.id)} />
              <ListSideGap />
              <IconButton label="Move up" icon={<ChevronUp16Regular />} disabled={index <= 0} onClick={() => active && moveAction(step.id, active.id, -1)} />
              <IconButton label="Move down" icon={<ChevronDown16Regular />} disabled={index < 0 || index >= step.actions.length - 1} onClick={() => active && moveAction(step.id, active.id, 1)} />
              <ListSideGap />
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <MenuButtonSmall iconOnly icon={<MoreHorizontal16Regular />} aria-label="More action commands" disabled={!active} />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem icon={<SplitVertical16Regular />} disabled={!active || !canSplitAction(active)} onClick={() => active && splitAction(step.id, active.id)}>
                      Split per element
                    </MenuItem>
                    <MenuItem icon={<Delete16Regular />} disabled={!active} onClick={() => active && removeAction(step.id, active.id)}>
                      Remove action
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </>
          }
        />
        {timed && <Note>{`The step runs ${formatTime(timed.endMs - timed.startMs)}, then holds ${formatTime(timed.holdEndMs - timed.endMs)}. The bars show when each action runs.`}</Note>}
      </Panel>

      {active && (
        <>
          <Panel id="act-what" title={`What: ${describe(active)}`}>
            <ActionEditor key={`what-${active.id}`} step={step} action={active} part="what" />
          </Panel>
          <Panel id="act-who" title={`Who (${active.targets.length})`}>
            {active.type === "camera" && active.targets.length === 0 ? (
              <Note>The camera action uses no elements.</Note>
            ) : (
              <div className={s.chips} role="list" aria-label="Targets">
                {active.targets.map((id) => (
                  <span key={id} className={s.chip} role="listitem">
                    {id}
                    <button
                      type="button"
                      className={s.chipX}
                      aria-label={`Remove ${id}`}
                      disabled={active.targets.length <= 1 && active.type !== "camera"}
                      onClick={() => updateAction(step.id, active.id, { targets: active.targets.filter((x) => x !== id) }, "Remove target")}
                    >
                      <Dismiss12Regular />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={s.row}>
              <Btn
                icon={<Add16Regular />}
                onClick={() =>
                  setPicker({
                    title: "Choose the elements",
                    ...(active.type === "flow" ? { only: ["connector"] as Element["type"][] } : {}),
                    initial: active.targets,
                    done: (ids) => updateAction(step.id, active.id, { targets: ids }, "Change targets"),
                  })
                }
              >
                Choose…
              </Btn>
              <Btn disabled={selection.length === 0} onClick={() => updateAction(step.id, active.id, { targets: [...selection] }, "Use selection")}>
                Use selection
              </Btn>
              <Btn icon={<Target16Regular />} disabled={active.targets.length === 0} onClick={() => useEditor.getState().setSelection(active.targets.filter((id) => id in elements))}>
                Select on canvas
              </Btn>
            </div>
          </Panel>
          <Panel id="act-when" title="When">
            <ActionEditor key={`when-${active.id}`} step={step} action={active} part="when" />
            <Prop label="Curve">
              <EasingCurve action={active} />
            </Prop>
            {index > 0 && (
              <Prop label="Start">
                <div className={s.row}>
                  <Btn title="Start at the same time as the action above" onClick={() => updateAction(step.id, active.id, { delayMs: step.actions[index - 1]!.delayMs }, "Start with previous")}>
                    With previous
                  </Btn>
                  <Btn
                    title="Start when the action above ends"
                    onClick={() => {
                      const prev = timed?.actions.filter((x) => x.action.id === step.actions[index - 1]!.id) ?? [];
                      if (timed && prev.length) updateAction(step.id, active.id, { delayMs: Math.max(...prev.map((p) => p.endMs)) - timed.startMs }, "Start after previous");
                    }}
                  >
                    After previous
                  </Btn>
                </div>
              </Prop>
            )}
          </Panel>
        </>
      )}
      <TargetPicker
        key={picker?.title ?? "none"}
        open={picker !== null}
        title={picker?.title ?? ""}
        initial={picker?.initial ?? []}
        {...(picker?.only ? { only: picker.only } : {})}
        onDone={(ids) => {
          const p = picker;
          setPicker(null);
          if (p && ids && ids.length) p.done(ids);
        }}
      />
    </>
  );
}
