import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, makeStyles, tokens } from "@fluentui/react-components";
import { THEMES, getTheme } from "@anivo/render";
import { type CustomTheme as CustomThemeT, CustomTheme } from "@anivo/schema";
import { useEffect, useState } from "react";
import { commitSettings } from "../commands.js";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";
import { SelectField } from "./fields.js";

const useStyles = makeStyles({
  surface: { maxWidth: "720px", width: "100%" },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: tokens.spacingHorizontalS, maxHeight: "46vh", overflowY: "auto" },
  token: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  color: { width: "36px", height: "28px", padding: 0, border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusSmall, backgroundColor: "transparent", cursor: "pointer" },
  row: { display: "flex", gap: tokens.spacingHorizontalM, alignItems: "end" },
});

/** Edit a custom theme of the scene: a built-in theme with other colors (FR-STYLE-03). */
export function ThemeEditor() {
  const styles = useStyles();
  const open = useEditor((s) => s.themeEditorOpen);
  const [draft, setDraft] = useState<CustomThemeT>({ name: "my-theme", base: "slate-dark", tokens: {} });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = useEditor.getState().scene.settings;
    setDraft(s.customTheme ?? { name: "my-theme", base: THEMES[s.theme] ? s.theme : "slate-dark", tokens: {} });
    setError(null);
  }, [open]);

  const base = getTheme(draft.base);
  const value = (t: string) => draft.tokens[t] ?? base.tokens[t] ?? "#888888";
  const close = () => useEditor.setState({ themeEditorOpen: false });

  const save = () => {
    const r = CustomTheme.safeParse(draft);
    if (!r.success) {
      setError(`The theme is not valid: ${r.error.issues[0]?.message ?? ""}. A name has lower-case letters, digits, and '-'.`);
      return;
    }
    commitSettings({ customTheme: r.data, theme: r.data.name }, "Change custom theme");
    notify(`Theme '${r.data.name}' saved in the scene`, "success");
    close();
  };

  const exportFile = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: "application/json" }));
    a.download = `${draft.name}.anivo-theme.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const importFile = async () => {
    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
    });
    if (!file) return;
    try {
      const r = CustomTheme.safeParse(JSON.parse(await file.text()));
      if (!r.success) throw new Error(r.error.issues[0]?.message);
      setDraft(r.data);
      setError(null);
    } catch (err) {
      setError(`The file '${file.name}' is not a valid Anivo theme. ${err instanceof Error ? err.message : ""}`.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface} aria-label="Theme editor">
        <DialogBody>
          <DialogTitle>Custom theme</DialogTitle>
          <DialogContent className={styles.content}>
            <div className={styles.row}>
              <Field label="Name" size="small">
                <Input size="small" value={draft.name} onChange={(_, d) => setDraft({ ...draft, name: d.value })} />
              </Field>
              <SelectField label="Start from" value={draft.base} options={Object.keys(THEMES).map((t) => ({ value: t, text: t }))} onCommit={(v) => setDraft({ ...draft, base: v })} />
            </div>
            <div className={styles.grid} role="group" aria-label="Theme colors">
              {Object.keys(base.tokens).map((t) => (
                <label key={t} className={styles.token}>
                  <input type="color" className={styles.color} value={value(t).slice(0, 7)} aria-label={t} onChange={(e) => setDraft({ ...draft, tokens: { ...draft.tokens, [t]: e.target.value } })} />
                  <span style={{ fontWeight: draft.tokens[t] ? 600 : 400 }}>{t}</span>
                </label>
              ))}
            </div>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="subtle" onClick={() => void importFile()}>
              Import…
            </Button>
            <Button appearance="subtle" onClick={exportFile}>
              Export
            </Button>
            <Button appearance="subtle" onClick={() => setDraft({ ...draft, tokens: {} })}>
              Reset colors
            </Button>
            <Button appearance="secondary" onClick={close}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={save}>
              Use theme
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
