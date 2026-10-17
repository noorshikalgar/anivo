import { THEMES } from "@anivo/render";
import {
  ColorSwatch,
  Dropdown,
  Field,
  Input,
  Option,
  SpinButton,
  SwatchPicker,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";

const useStyles = makeStyles({
  row: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: tokens.spacingHorizontalS, alignItems: "end" },
  // Fluent Dropdown has a default minimum width of 250 px. The panel is narrower.
  fill: { minWidth: 0, width: "100%" },
  swatches: { flexWrap: "wrap", gap: "4px" },
});

export function Row({ children }: { children: React.ReactNode }) {
  return <div className={useStyles().row}>{children}</div>;
}

/** Number input that commits on Enter, blur, or a step button. */
export function NumberField({ label, value, onCommit, min, max, step = 1 }: { label: string; value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number }) {
  const rounded = Math.round(value * 100) / 100;
  return (
    <Field label={label} size="small">
      <SpinButton
        className={useStyles().fill}
        size="small"
        value={rounded}
        min={min}
        max={max}
        step={step}
        onChange={(_, d) => {
          const v = d.value ?? (d.displayValue !== undefined ? Number(d.displayValue) : NaN);
          if (Number.isFinite(v) && v !== rounded) onCommit(v);
        }}
      />
    </Field>
  );
}

/** Text input that commits on Enter or blur. Shows a validation message from `onCommit`. */
export function TextField({ label, value, onCommit, multiline, placeholder }: { label: string; value: string; onCommit: (v: string) => string | undefined | void; multiline?: boolean; placeholder?: string }) {
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
    <Field label={label} size="small" validationState={error ? "error" : "none"} validationMessage={error}>
      {multiline ? <Textarea size="small" resize="vertical" {...props} /> : <Input size="small" {...props} />}
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, options, onCommit }: { label: string; value: T; options: { value: T; text: string }[]; onCommit: (v: T) => void }) {
  return (
    <Field label={label} size="small">
      <Dropdown className={useStyles().fill} size="small" value={options.find((o) => o.value === value)?.text ?? value} selectedOptions={[value]} onOptionSelect={(_, d) => d.optionValue && d.optionValue !== value && onCommit(d.optionValue as T)}>
        {options.map((o) => (
          <Option key={o.value} value={o.value}>
            {o.text}
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}

/** Color tokens of the scene theme as swatches. "default" uses the theme default for the element. */
const COLOR_TOKENS = ["default", "transparent", "surface", "surface-strong", "text", "muted", "line", "accent", "accent-soft", "success", "success-soft", "warning", "warning-soft", "danger", "danger-soft", "purple", "teal"];

export function ColorField({ label, value, theme, onCommit }: { label: string; value: string | undefined; theme: string; onCommit: (v: string | null) => void }) {
  const styles = useStyles();
  const t = THEMES[theme] ?? THEMES["slate-dark"]!;
  const selected = value ?? "default";
  return (
    <Field label={label} size="small">
      <SwatchPicker className={styles.swatches} size="small" shape="rounded" selectedValue={selected} onSelectionChange={(_, d) => d.selectedValue !== selected && onCommit(d.selectedValue === "default" ? null : d.selectedValue)} aria-label={label}>
        {COLOR_TOKENS.map((token) => (
          <ColorSwatch
            key={token}
            value={token}
            color={token === "default" ? "transparent" : token === "transparent" ? "transparent" : (t.tokens[token] ?? "#888888")}
            aria-label={token === "default" ? "Theme default" : token}
            title={token === "default" ? "Theme default" : token}
            style={token === "default" || token === "transparent" ? { backgroundImage: "linear-gradient(135deg, transparent 45%, #d64545 45%, #d64545 55%, transparent 55%)" } : undefined}
          />
        ))}
      </SwatchPicker>
    </Field>
  );
}
