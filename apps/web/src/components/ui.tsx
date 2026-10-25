/**
 * The controls of the editor UI (docs/15): panels, property rows, drag number
 * fields, icon toggles, color fields, and list views. One look and one
 * behavior everywhere.
 */
import { ColorSwatch, Popover, PopoverSurface, PopoverTrigger, SwatchPicker, Tooltip, makeStyles, mergeClasses } from "@fluentui/react-components";
import { ChevronDown12Filled, ChevronLeft12Regular, ChevronRight12Filled, ChevronRight12Regular } from "@fluentui/react-icons";
import { type ReactNode, forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** The height of a control row (docs/35: roomier than before). */
export const H = "26px";

const useStyles = makeStyles({
  // --- panel
  panel: { backgroundColor: "var(--ui-panel)", borderRadius: "6px", overflow: "hidden", flexShrink: 0 },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    height: "30px",
    padding: "0 6px 0 4px",
    backgroundColor: "var(--ui-panel-header)",
    color: "var(--ui-text)",
    fontSize: "12px",
    userSelect: "none",
  },
  panelToggle: {
    flexGrow: 1,
    display: "flex",
    alignItems: "center",
    gap: "4px",
    height: "100%",
    border: "none",
    background: "none",
    color: "inherit",
    font: "inherit",
    padding: "0 2px",
    textAlign: "left",
    cursor: "pointer",
    ":focus-visible": { outline: "1px solid var(--ui-select)", outlineOffset: "-1px" },
  },
  chevron: { color: "var(--ui-muted)", display: "flex" },
  panelBody: { display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px 12px" },
  // --- property row
  prop: { display: "grid", gridTemplateColumns: "36% minmax(0, 1fr)", alignItems: "center", columnGap: "10px", minHeight: H },
  propLabel: { textAlign: "right", color: "var(--ui-muted)", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  propFull: { gridColumn: "1 / -1" },
  propTop: { alignItems: "start" },
  propLabelTop: { paddingTop: "4px" },
  // --- aligned column
  aligned: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    "> *": { borderRadius: "0 !important" },
    "> *:first-child": { borderTopLeftRadius: "4px !important", borderTopRightRadius: "4px !important" },
    "> *:last-child": { borderBottomLeftRadius: "4px !important", borderBottomRightRadius: "4px !important" },
  },
  alignedRow: {
    display: "flex",
    gap: "1px",
    "> *": { flex: "1 1 0", minWidth: 0, borderRadius: "0 !important" },
    "> *:first-child": { borderTopLeftRadius: "4px !important", borderBottomLeftRadius: "4px !important" },
    "> *:last-child": { borderTopRightRadius: "4px !important", borderBottomRightRadius: "4px !important" },
  },
  // --- number field
  num: {
    position: "relative",
    height: H,
    borderRadius: "4px",
    backgroundColor: "var(--ui-widget)",
    color: "var(--ui-text)",
    display: "flex",
    alignItems: "center",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
    ":hover > button": { opacity: 1 },
  },
  numEditing: { backgroundColor: "var(--ui-field) !important", outline: "1px solid var(--ui-select)" },
  numInput: {
    flexGrow: 1,
    minWidth: 0,
    height: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontSize: "12px",
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
    padding: "0 14px",
    cursor: "ew-resize",
    "::selection": { backgroundColor: "var(--ui-select)" },
  },
  numInputEditing: { cursor: "text", textAlign: "left", padding: "0 6px" },
  numInputInner: { textAlign: "right" },
  numInner: { position: "absolute", left: "14px", color: "var(--ui-muted)", fontSize: "12px", pointerEvents: "none" },
  arrow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "none",
    color: "var(--ui-muted)",
    padding: 0,
    cursor: "pointer",
    opacity: 0,
    ":hover": { color: "var(--ui-text)" },
  },
  // --- icon toggle and tool buttons
  iconBtn: {
    width: H,
    height: H,
    minWidth: H,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: "4px",
    background: "transparent",
    color: "var(--ui-muted)",
    padding: 0,
    cursor: "pointer",
    ":hover": { backgroundColor: "var(--ui-hover)", color: "var(--ui-text)" },
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
    ":disabled": { opacity: 0.4, cursor: "default" },
  },
  iconOn: { color: "var(--ui-text)" },
  iconOff: { opacity: 0.55 },
  toolOn: { backgroundColor: "var(--ui-select) !important", color: "#fff !important" },
  // --- button
  btn: {
    height: H,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    padding: "0 8px",
    border: "none",
    borderRadius: "4px",
    backgroundColor: "var(--ui-widget)",
    color: "var(--ui-text)",
    font: "inherit",
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
    ":disabled": { opacity: 0.4, cursor: "default" },
  },
  btnPrimary: { backgroundColor: "var(--ui-select)", color: "#fff", ":hover": { backgroundColor: "#5580bd" } },
  // --- color field
  color: {
    height: H,
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "0 6px 0 3px",
    border: "none",
    borderRadius: "4px",
    backgroundColor: "var(--ui-widget)",
    color: "var(--ui-text)",
    font: "inherit",
    fontSize: "12px",
    cursor: "pointer",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
    ":focus-visible": { outline: "1px solid var(--ui-select)" },
  },
  colorChip: { width: "28px", height: "16px", borderRadius: "3px", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)", flexShrink: 0 },
  colorName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ui-muted)" },
  swatches: { flexWrap: "wrap", gap: "4px", width: "196px" },
  // --- list view
  list: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "4px" },
  listRows: { backgroundColor: "var(--ui-list)", borderRadius: "4px", minHeight: "66px", padding: "2px 0", overflow: "hidden" },
  listSide: { display: "flex", flexDirection: "column", gap: "1px" },
  listGap: { height: "6px" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    height: "22px",
    padding: "0 6px",
    fontSize: "12px",
    color: "var(--ui-text)",
    cursor: "default",
    border: "none",
    background: "none",
    font: "inherit",
    width: "100%",
    textAlign: "left",
    ":nth-child(even)": { backgroundColor: "var(--ui-list-alt)" },
    ":hover": { backgroundColor: "var(--ui-hover)" },
    ":focus-visible": { outline: "1px solid var(--ui-select)", outlineOffset: "-1px" },
  },
  rowActive: { backgroundColor: "var(--ui-row-selected) !important", "--ui-muted": "var(--ui-muted-on-select)" } as never,
  rowText: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowMeta: { color: "var(--ui-muted)", fontSize: "11px", whiteSpace: "nowrap" },
  empty: { color: "var(--ui-faint)", fontSize: "11px", padding: "4px 8px" },
  note: { color: "var(--ui-muted)", fontSize: "11px", lineHeight: "15px" },
  separator: { height: "1px", backgroundColor: "var(--ui-line)", margin: "4px 0" },
  // --- area header
  areaHeader: { display: "flex", alignItems: "center", gap: "4px", height: "26px", minHeight: "26px", padding: "0 4px 0 8px", backgroundColor: "var(--ui-header)", color: "var(--ui-text)", fontSize: "12px", borderBottom: "1px solid var(--ui-line)" },
  areaTitle: { fontWeight: 600, marginRight: "auto", paddingRight: "6px", whiteSpace: "nowrap", flexShrink: 0 },
  search: {
    height: "20px",
    minWidth: 0,
    width: "100%",
    maxWidth: "140px",
    flexShrink: 1,
    border: "1px solid transparent",
    borderRadius: "10px",
    backgroundColor: "var(--ui-field)",
    color: "var(--ui-text)",
    font: "inherit",
    fontSize: "11px",
    padding: "0 8px",
    outline: "none",
    ":focus": { border: "1px solid var(--ui-select)" },
    "::placeholder": { color: "var(--ui-faint)" },
  },
  // --- checkbox
  check: { display: "inline-flex", alignItems: "center", gap: "6px", minHeight: H, fontSize: "12px", color: "var(--ui-text)", cursor: "pointer", userSelect: "none" },
  checkBox: {
    appearance: "none",
    margin: 0,
    width: "14px",
    height: "14px",
    borderRadius: "3px",
    backgroundColor: "var(--ui-widget)",
    cursor: "pointer",
    display: "grid",
    placeContent: "center",
    ":hover": { backgroundColor: "var(--ui-widget-hover)" },
    ":checked": { backgroundColor: "var(--ui-select)", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M3.5 7.2l2.3 2.3 4.7-5' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")" },
    ":focus-visible": { outline: "1px solid var(--ui-select)", outlineOffset: "1px" },
  },
});

// --- panel ----------------------------------------------------------------------------------

const PANEL_KEY = "anivo.panels";
function readPanels(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(PANEL_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}
function writePanels(v: Record<string, boolean>): void {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(v));
  } catch {
    // Storage can be blocked. The panels then open again on reload.
  }
  window.dispatchEvent(new Event("anivo-panels"));
}

/**
 * A collapsible group of settings. Click the header to collapse or expand.
 * Ctrl+click: expand this panel and collapse the other panels in the same list.
 */
export function Panel({ id, title, children, actions, defaultOpen = true, group }: { id: string; title: ReactNode; children: ReactNode; actions?: ReactNode; defaultOpen?: boolean; group?: string[] }) {
  const s = useStyles();
  const [open, setOpen] = useState(() => readPanels()[id] ?? defaultOpen);
  useEffect(() => {
    const on = () => setOpen(readPanels()[id] ?? defaultOpen);
    window.addEventListener("anivo-panels", on);
    return () => window.removeEventListener("anivo-panels", on);
  }, [id, defaultOpen]);
  const bodyId = useId();
  const toggle = (e: React.MouseEvent) => {
    const all = readPanels();
    if ((e.ctrlKey || e.metaKey) && group) {
      for (const g of group) all[g] = g === id;
    } else all[id] = !open;
    writePanels(all);
  };
  return (
    <section className={s.panel} aria-label={typeof title === "string" ? title : undefined}>
      <div className={s.panelHeader}>
        <button type="button" className={s.panelToggle} aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <span className={s.chevron}>{open ? <ChevronDown12Filled /> : <ChevronRight12Filled />}</span>
          {title}
        </button>
        {actions}
      </div>
      {open && (
        <div id={bodyId} className={s.panelBody}>
          {children}
        </div>
      )}
    </section>
  );
}

// --- property row ---------------------------------------------------------------------------

/** A setting: the label on the left (aligned right), the control on the right. No label: the control uses the full width. */
export function Prop({ label, children, top }: { label?: ReactNode; children: ReactNode; top?: boolean }) {
  const s = useStyles();
  if (label === undefined) return <div className={mergeClasses(s.prop)}><div className={s.propFull}>{children}</div></div>;
  return (
    <div className={mergeClasses(s.prop, top && s.propTop)}>
      <span className={mergeClasses(s.propLabel, top && s.propLabelTop)}>{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** Fields that touch, in a column (X above Y) or in a row. */
export function Aligned({ children, row }: { children: ReactNode; row?: boolean }) {
  const s = useStyles();
  return <div className={row ? s.alignedRow : s.aligned}>{children}</div>;
}

export function Note({ children }: { children: ReactNode }) {
  return <div className={useStyles().note}>{children}</div>;
}

export function Separator() {
  return <div className={useStyles().separator} role="separator" />;
}

// --- number field ---------------------------------------------------------------------------

let gesture = 0;

/** Value of simple arithmetic: numbers, + - * /, and parentheses. NaN if the text is not valid. */
export function evalArithmetic(text: string): number {
  const t = text.replace(/\s+/g, "");
  let i = 0;
  const num = (): number => {
    if (t[i] === "(") {
      i++;
      const v = sum();
      if (t[i++] !== ")") return NaN;
      return v;
    }
    if (t[i] === "-") {
      i++;
      return -num();
    }
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(t.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    return Number(m[0]);
  };
  const product = (): number => {
    let v = num();
    while (t[i] === "*" || t[i] === "/") v = t[i++] === "*" ? v * num() : v / num();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (t[i] === "+" || t[i] === "-") v = t[i++] === "+" ? v + product() : v - product();
    return v;
  };
  const v = sum();
  return i === t.length ? v : NaN;
}

export interface DragNumberProps {
  /** Accessible name. With `inner`, the label also shows inside the field. */
  label: string;
  value: number;
  /** A drag calls this for each change with one merge key for the gesture (one undo step). */
  onCommit: (v: number, mergeKey?: string) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Digits after the point in the display. */
  precision?: number;
  unit?: string;
  inner?: boolean;
  disabled?: boolean;
}

/**
 * Number field (docs/15): drag left or right to change the value; Shift for a
 * fine change, Ctrl for steps of 10. Click (or focus) to type. Enter applies,
 * Escape cancels. The arrows change the value by one step.
 */
export function DragNumber({ label, value, onCommit, min = -Infinity, max = Infinity, step = 1, precision, unit = "", inner, disabled }: DragNumberProps) {
  const s = useStyles();
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<number | null>(null);
  const digits = precision ?? (step < 1 ? Math.min(3, Math.max(1, -Math.floor(Math.log10(step)))) : 0);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const shown = live ?? value;
  const display = `${Number(shown.toFixed(digits))}${unit}`;
  const cancelled = useRef(false);
  // Typing replaces the whole value: select it as soon as the field is in edit mode.
  useLayoutEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commitDraft = () => {
    // Simple arithmetic: "120+40", "1920/2".
    const text = draft.trim().replace(/[a-z%]+$/i, "");
    const v = text === "" ? NaN : evalArithmetic(text);
    if (Number.isFinite(v) && clamp(v) !== value) onCommit(clamp(v));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (editing || disabled || e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let moved = false;
    let last = value;
    const key = `num-${++gesture}`;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      const per = step * (ev.shiftKey ? 0.1 : 1);
      let v = value + Math.round(dx / 2) * per;
      if (ev.ctrlKey || ev.metaKey) v = Math.round(v / (step * 10)) * step * 10;
      v = clamp(Number(v.toFixed(Math.max(digits, ev.shiftKey ? digits + 1 : digits))));
      if (v !== last) {
        last = v;
        setLive(v);
        onCommit(v, key);
      }
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setLive(null);
      if (!moved) el.focus();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const nudge = (dir: number) => {
    const v = clamp(Number((value + dir * step).toFixed(digits + 1)));
    if (v !== value) onCommit(v);
  };

  return (
    <div className={mergeClasses(s.num, editing && s.numEditing)} style={disabled ? { opacity: 0.5 } : undefined}>
      {!editing && (
        <button type="button" tabIndex={-1} aria-hidden className={s.arrow} style={{ left: 0 }} onClick={() => nudge(-1)} disabled={disabled}>
          <ChevronLeft12Regular />
        </button>
      )}
      {inner && !editing && <span className={s.numInner}>{label}</span>}
      <input
        ref={input}
        className={mergeClasses(s.numInput, editing && s.numInputEditing, inner && !editing && s.numInputInner)}
        style={inner && !editing ? { paddingLeft: "40px" } : undefined}
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        {...(Number.isFinite(min) ? { "aria-valuemin": min } : {})}
        {...(Number.isFinite(max) ? { "aria-valuemax": max } : {})}
        disabled={disabled}
        value={editing ? draft : display}
        onPointerDown={onPointerDown}
        onFocus={() => {
          setDraft(String(Number(value.toFixed(Math.max(digits, 3)))));
          setEditing(true);
          cancelled.current = false;
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!cancelled.current) commitDraft();
          setEditing(false);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const v = clamp(Number(((Number(draft) || value) + (e.key === "ArrowUp" ? step : -step)).toFixed(digits + 1)));
            setDraft(String(v));
            onCommit(v);
          }
        }}
      />
      {!editing && (
        <button type="button" tabIndex={-1} aria-hidden className={s.arrow} style={{ right: 0 }} onClick={() => nudge(1)} disabled={disabled}>
          <ChevronRight12Regular />
        </button>
      )}
    </div>
  );
}

// --- buttons --------------------------------------------------------------------------------

/** An icon button with a tooltip. `pressed` makes it a toggle (for example the eye or the lock). */
export function IconButton({ label, icon, onClick, pressed, offIcon, tool, disabled, className }: { label: string; icon: ReactNode; onClick: (e: React.MouseEvent) => void; pressed?: boolean; offIcon?: ReactNode; tool?: boolean; disabled?: boolean; className?: string }) {
  const s = useStyles();
  const toggle = pressed !== undefined;
  return (
    <Tooltip content={label} relationship="label" withArrow={false} positioning="below">
      <button
        type="button"
        className={mergeClasses(s.iconBtn, toggle && !tool && (pressed ? s.iconOn : s.iconOff), tool && pressed && s.toolOn, className)}
        aria-pressed={toggle ? pressed : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
        disabled={disabled}
      >
        {toggle && !pressed && offIcon ? offIcon : icon}
      </button>
    </Tooltip>
  );
}

export function Btn({ children, onClick, primary, icon, disabled, title, className }: { children?: ReactNode; onClick: () => void; primary?: boolean; icon?: ReactNode; disabled?: boolean; title?: string; className?: string }) {
  const s = useStyles();
  return (
    <button type="button" className={mergeClasses(s.btn, primary && s.btnPrimary, className)} onClick={onClick} disabled={disabled} title={title}>
      {icon}
      {children}
    </button>
  );
}

// --- color field ----------------------------------------------------------------------------

/** One swatch bar. Click it to choose a color of the scene theme. */
export function ColorPick({ label, value, colors, onCommit, defaultCss }: { label: string; value: string | undefined; colors: { token: string; css: string }[]; onCommit: (v: string | null) => void; /** The color that Default gives (the theme default). Without it, Default means none. */ defaultCss?: string }) {
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const selected = value ?? "default";
  const css = colors.find((c) => c.token === selected)?.css ?? (value && /^#/.test(value) ? value : undefined);
  const none = (selected === "default" && !defaultCss) || selected === "transparent";
  const chip = selected === "default" && defaultCss ? { backgroundColor: defaultCss } : none ? { backgroundImage: "linear-gradient(135deg, transparent 44%, #d64545 44%, #d64545 56%, transparent 56%)", backgroundColor: "var(--ui-field)" } : { backgroundColor: css ?? "#888" };
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="below-start" trapFocus>
      <PopoverTrigger disableButtonEnhancement>
        <button type="button" className={s.color} aria-label={`${label}: ${selected === "default" ? "theme default" : selected}`}>
          <span className={s.colorChip} style={chip} />
          <span className={s.colorName}>{selected === "default" ? (defaultCss ? "Default (theme)" : "None") : selected}</span>
        </button>
      </PopoverTrigger>
      <PopoverSurface style={{ padding: "8px", backgroundColor: "var(--ui-menu)" }}>
        <SwatchPicker
          className={s.swatches}
          size="small"
          shape="rounded"
          selectedValue={selected}
          onSelectionChange={(_, d) => {
            setOpen(false);
            if (d.selectedValue !== selected) onCommit(d.selectedValue === "default" ? null : d.selectedValue);
          }}
          aria-label={label}
        >
          {colors.map((c) => (
            <ColorSwatch
              key={c.token}
              value={c.token}
              color={c.token === "default" || c.token === "transparent" ? "transparent" : c.css}
              aria-label={c.token === "default" ? "Theme default" : c.token}
              title={c.token === "default" ? "Theme default" : c.token}
              style={c.token === "default" || c.token === "transparent" ? { backgroundImage: "linear-gradient(135deg, transparent 45%, #d64545 45%, #d64545 55%, transparent 55%)" } : undefined}
            />
          ))}
        </SwatchPicker>
      </PopoverSurface>
    </Popover>
  );
}

// --- list view ------------------------------------------------------------------------------

export interface ListItem {
  id: string;
  icon?: ReactNode;
  text: ReactNode;
  meta?: ReactNode;
  /** Controls at the end of the row, for example icon toggles. */
  end?: ReactNode;
}

/**
 * A list of items (docs/15): compact rows, the active row in the selection
 * color, and a column of buttons on the right.
 */
export function ListView({ label, items, active, onActivate, side, empty, onRowKey }: { label: string; items: ListItem[]; active: string | null; onActivate: (id: string) => void; side?: ReactNode; empty?: string; onRowKey?: (id: string, e: React.KeyboardEvent) => void }) {
  const s = useStyles();
  return (
    <div className={s.list}>
      <div className={s.listRows} role="listbox" aria-label={label}>
        {items.length === 0 && <div className={s.empty}>{empty ?? "Empty"}</div>}
        {items.map((it) => (
          <div
            key={it.id}
            role="option"
            aria-selected={it.id === active}
            tabIndex={it.id === active || (active === null && it === items[0]) ? 0 : -1}
            className={mergeClasses(s.row, it.id === active && s.rowActive)}
            onClick={() => onActivate(it.id)}
            onKeyDown={(e) => {
              const i = items.indexOf(it);
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = items[i + (e.key === "ArrowDown" ? 1 : -1)];
                if (n) {
                  onActivate(n.id);
                  ((e.currentTarget.parentElement?.children[items.indexOf(n) + (items.length === 0 ? 1 : 0)] as HTMLElement | undefined) ?? null)?.focus();
                }
              } else onRowKey?.(it.id, e);
            }}
          >
            {it.icon}
            <span className={s.rowText}>{it.text}</span>
            {it.meta !== undefined && <span className={s.rowMeta}>{it.meta}</span>}
            {it.end}
          </div>
        ))}
      </div>
      {side && <div className={s.listSide}>{side}</div>}
    </div>
  );
}

export function ListSideGap() {
  return <div className={useStyles().listGap} />;
}

// --- checkbox and menu trigger ------------------------------------------------------------

/** A checkbox with its text on the right (docs/15). */
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const s = useStyles();
  return (
    <label className={s.check}>
      <input type="checkbox" className={s.checkBox} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** A button that opens a menu: put it inside a Fluent MenuTrigger. */
export const MenuButtonSmall = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; iconOnly?: boolean }>(function MenuButtonSmall({ icon, iconOnly, children, className, ...rest }, ref) {
  const s = useStyles();
  return (
    <button ref={ref} type="button" className={mergeClasses(iconOnly ? s.iconBtn : s.btn, className)} title={iconOnly ? (rest["aria-label"] as string | undefined) : undefined} {...rest}>
      {icon}
      {iconOnly ? null : children}
    </button>
  );
});

// --- area header --------------------------------------------------------------------------

/** The header strip of an area (docs/15): the title on the left, tools on the right. */
export function AreaHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const s = useStyles();
  return (
    <div className={s.areaHeader}>
      <span className={s.areaTitle}>{title}</span>
      {children}
    </div>
  );
}

/** A small search field for an area header. */
export function SearchBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const s = useStyles();
  return <input type="search" className={s.search} placeholder="Search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onChange(""); }} />;
}

// --- splitter -----------------------------------------------------------------------------

/**
 * A drag handle on the edge of an area (docs/15): drag to resize the area.
 * `onDrag` gets the move in px from the start of the drag. Double-click resets.
 */
export function Splitter({ axis, label, onStart, onDrag, onReset, style }: { axis: "x" | "y"; label: string; onStart: () => void; onDrag: (delta: number) => void; onReset?: () => void; style?: React.CSSProperties }) {
  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      title={`${label} (drag; double-click to reset)`}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const start = axis === "x" ? e.clientX : e.clientY;
        onStart();
        const move = (ev: PointerEvent) => onDrag((axis === "x" ? ev.clientX : ev.clientY) - start);
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          document.body.style.cursor = "";
        };
        document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
      style={{ position: "absolute", zIndex: 5, cursor: axis === "x" ? "col-resize" : "row-resize", touchAction: "none", ...(axis === "x" ? { top: 0, bottom: 0, width: "6px" } : { left: 0, right: 0, height: "6px" }), ...style }}
    />
  );
}
