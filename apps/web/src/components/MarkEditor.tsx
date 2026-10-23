/**
 * The editor of a mark action (docs/20 B1): click the words of the text to
 * choose the phrase (Shift + click to add the words up to there), then set
 * its color, highlight, and underline, and the dim color of the other words.
 */
import type { Action } from "@anivo/schema";
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { useEditor } from "../store.js";
import { ColorField } from "./fields.js";
import { Check, Note, Prop } from "./ui.js";

type MarkAction = Extract<Action, { type: "mark" }>;

const useStyles = makeStyles({
  words: { display: "flex", flexWrap: "wrap", gap: "3px", padding: "4px 0" },
  word: {
    border: "1px solid var(--ui-outline)",
    borderRadius: "3px",
    padding: "1px 5px",
    fontSize: "12px",
    cursor: "pointer",
    backgroundColor: "var(--ui-field)",
    color: "var(--ui-text)",
    ":hover": { backgroundColor: "var(--ui-hover)" },
  },
  on: { backgroundColor: "var(--ui-select) !important", color: "#fff", border: "1px solid var(--ui-select)" },
});

interface Word {
  text: string;
  start: number;
  end: number;
}

function wordsOf(text: string): Word[] {
  const out: Word[] = [];
  const re = /\S+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** The words that the phrase covers now (the same match rule as the engine: whole words, case-insensitive). */
function selected(text: string, words: Word[], phrase: string, occurrence: number): Set<number> {
  const p = phrase.trim().toLowerCase();
  if (!p) return new Set();
  const t = text.toLowerCase();
  let from = 0;
  let n = 0;
  for (;;) {
    const i = t.indexOf(p, from);
    if (i < 0) return new Set();
    const okStart = i === 0 || /\W/.test(t[i - 1]!);
    const okEnd = i + p.length >= t.length || /\W/.test(t[i + p.length]!);
    if (okStart && okEnd && ++n === occurrence) return new Set(words.flatMap((w, k) => (w.start >= i && w.end <= i + p.length ? [k] : [])));
    from = i + 1;
  }
}

export function MarkEditor({ action, set }: { action: MarkAction; set: (s: Record<string, unknown>, name?: string) => void }) {
  const s = useStyles();
  const theme = useEditor((st) => st.scene.settings.theme);
  const el = useEditor((st) => st.scene.elements[action.targets[0] ?? ""]);
  const text = el?.type === "text" ? el.content.text : el && "label" in el ? (el.label?.text ?? "") : "";
  const words = wordsOf(text);
  const m = action.mark;
  const on = selected(text, words, m.phrase, m.occurrence);
  const mark = (patch: Record<string, unknown>, name = "Change mark") => set({ mark: { ...m, ...patch } }, name);

  const pick = (k: number, extend: boolean) => {
    const cur = [...on].sort((a, b) => a - b);
    let a = k;
    let b = k;
    if (extend && cur.length) {
      a = Math.min(cur[0]!, k);
      b = Math.max(cur[cur.length - 1]!, k);
    }
    const start = words[a]!.start;
    const end = words[b]!.end;
    const phrase = text.slice(start, end);
    // Which match of this phrase starts here.
    let occurrence = 0;
    const p = phrase.toLowerCase();
    const t = text.toLowerCase();
    for (let i = t.indexOf(p); i >= 0 && i <= start; i = t.indexOf(p, i + 1)) {
      const okStart = i === 0 || /\W/.test(t[i - 1]!);
      const okEnd = i + p.length >= t.length || /\W/.test(t[i + p.length]!);
      if (okStart && okEnd) occurrence++;
    }
    mark({ phrase, occurrence: Math.max(1, occurrence) }, "Choose the words");
  };

  return (
    <>
      <Prop label="Words" top>
        {words.length ? (
          <div className={s.words} role="group" aria-label="Words of the text">
            {words.map((w, k) => (
              <button key={k} type="button" aria-pressed={on.has(k)} className={mergeClasses(s.word, on.has(k) && s.on)} onClick={(e) => pick(k, e.shiftKey)}>
                {w.text}
              </button>
            ))}
          </div>
        ) : (
          <Note>The target has no text.</Note>
        )}
      </Prop>
      <Note>Click a word. Shift + click adds the words up to there.</Note>
      <ColorField label="Color" theme={theme} value={m.color} onCommit={(v) => mark({ color: v ?? undefined })} />
      <ColorField label="Highlight" theme={theme} value={m.highlight} onCommit={(v) => mark({ highlight: v ?? undefined })} />
      <ColorField label="Underline" theme={theme} value={m.underline} onCommit={(v) => mark({ underline: v ?? undefined })} />
      <ColorField label="Dim the rest" theme={theme} value={m.dim} onCommit={(v) => mark({ dim: v ?? undefined })} />
      <Prop label="">
        <Check label="Clear the marks first" checked={m.clear} onChange={(v) => mark({ clear: v })} />
      </Prop>
    </>
  );
}
