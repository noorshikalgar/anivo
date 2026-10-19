/**
 * Settings fields of the panels (docs/15). Each field is a property row: the
 * label on the left, the control on the right.
 */
import { sceneTheme } from "@anivo/render";
import { Dropdown, Input, Option, Textarea, makeStyles } from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { useEditor } from "../store.js";
import { ColorPick, DragNumber, Prop } from "./ui.js";

const useStyles = makeStyles({
  // Fields of a Row are rows of their own: a label column is too narrow in half a panel.
  row: { display: "flex", flexDirection: "column", gap: "2px" },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: "22px",
    height: "22px",
    borderRadius: "4px",
    backgroundColor: "var(--ui-field)",
    border: "1px solid transparent",
    fontSize: "12px",
    "::after": { display: "none" },
    ":hover": { border: "1px solid var(--ui-outline)" },
    ":focus-within": { border: "1px solid var(--ui-select)" },
    "> input": { padding: "0 6px", fontSize: "12px" },
  },
  textarea: {
    width: "100%",
    minWidth: 0,
    borderRadius: "4px",
    backgroundColor: "var(--ui-field)",
    border: "1px solid transparent",
    "::after": { display: "none" },
    ":hover": { border: "1px solid var(--ui-outline)" },
    ":focus-within": { border: "1px solid var(--ui-select)" },
    "> textarea": { padding: "3px 6px", fontSize: "12px", minHeight: "44px", lineHeight: "16px" },
  },
  select: {
    width: "100%",
    minWidth: 0,
    height: "22px",
    minHeight: "22px",
    borderRadius: "4px",
    backgroundColor: "var(--ui-menu)",
    border: "none",
    "::after": { display: "none" },
    ":hover": { backgroundColor: "var(--ui-hover)" },
  },
  selectButton: { minHeight: "22px", height: "22px", padding: "0 4px 0 6px", fontSize: "12px", color: "var(--ui-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 },
  error: { color: "var(--colorPaletteRedForeground1, #e06c6c)", fontSize: "11px", gridColumn: "2" },
});

export function Row({ children }: { children: React.ReactNode }) {
  return <div className={useStyles().row}>{children}</div>;
}

/** Number field: drag to change, click to type (docs/15). A drag passes one merge key: one undo step. */
export function NumberField({ label, value, onCommit, min, max, step = 1, unit }: { label: string; value: number; onCommit: (v: number, mergeKey?: string) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return (
    <Prop label={label}>
      <DragNumber label={label} value={value} onCommit={onCommit} {...(min !== undefined ? { min } : {})} {...(max !== undefined ? { max } : {})} step={step} {...(unit ? { unit } : {})} />
    </Prop>
  );
}

/** Text input that commits on Enter or blur. Shows a validation message from `onCommit`. */
export function TextField({ label, value, onCommit, multiline, placeholder, hideLabel }: { label: string; value: string; onCommit: (v: string) => string | undefined | void; multiline?: boolean; placeholder?: string; hideLabel?: boolean }) {
  const s = useStyles();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setDraft(value);
    setError(undefined);
  }, [value]);
  const commit = () => {
    if (draft === value) return;
    const err = onCommit(draft);
    setError(err || undefined);
    if (err) setDraft(value);
  };
  const props = {
    value: draft,
    placeholder,
    "aria-label": label,
    onBlur: commit,
    onChange: (_: unknown, d: { value: string }) => setDraft(d.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") setDraft(value);
    },
  };
  return (
    <>
      <Prop {...(hideLabel ? {} : { label })} top={multiline}>
        {multiline ? <Textarea className={s.textarea} size="small" resize="vertical" {...props} /> : <Input className={s.input} size="small" {...props} />}
      </Prop>
      {error && (
        <Prop label="">
          <span className={s.error} role="alert">
            {error}
          </span>
        </Prop>
      )}
    </>
  );
}

/** A dropdown of fixed choices. */
export function Select<T extends string>({ label, value, options, onCommit }: { label: string; value: T; options: { value: T; text: string }[]; onCommit: (v: T) => void }) {
  const s = useStyles();
  return (
    <Dropdown
      className={s.select}
      button={{ className: s.selectButton }}
      size="small"
      aria-label={label}
      value={options.find((o) => o.value === value)?.text ?? value}
      selectedOptions={[value]}
      onOptionSelect={(_, d) => d.optionValue && d.optionValue !== value && onCommit(d.optionValue as T)}
    >
      {options.map((o) => (
        <Option key={o.value} value={o.value}>
          {o.text}
        </Option>
      ))}
    </Dropdown>
  );
}

export function SelectField<T extends string>({ label, value, options, onCommit }: { label: string; value: T; options: { value: T; text: string }[]; onCommit: (v: T) => void }) {
  return (
    <Prop label={label}>
      <Select label={label} value={value} options={options} onCommit={onCommit} />
    </Prop>
  );
}

/** Color tokens of the scene theme. "default" uses the theme default for the element. */
const COLOR_TOKENS = ["default", "transparent", "surface", "surface-strong", "text", "muted", "line", "accent", "accent-soft", "success", "success-soft", "warning", "warning-soft", "danger", "danger-soft", "purple", "teal"];

/** The colors of the scene theme, for a color field. */
export function useThemeColors(theme: string): { token: string; css: string }[] {
  const custom = useEditor((s) => s.scene.settings.customTheme);
  return useMemo(() => {
    const t = sceneTheme({ settings: { theme, ...(custom ? { customTheme: custom } : {}) } });
    return COLOR_TOKENS.map((token) => ({ token, css: t.tokens[token] ?? "#888888" }));
  }, [theme, custom]);
}

export function ColorField({ label, value, theme, onCommit }: { label: string; value: string | undefined; theme: string; onCommit: (v: string | null) => void }) {
  const colors = useThemeColors(theme);
  return (
    <Prop label={label}>
      <ColorPick label={label} value={value} colors={colors} onCommit={onCommit} />
    </Prop>
  );
}
