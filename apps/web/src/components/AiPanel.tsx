import { Button, Dropdown, Field, Input, MessageBar, MessageBarBody, Option, Text, Textarea, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { Dismiss20Regular, Send20Regular, Settings20Regular, Stop20Regular } from "@fluentui/react-icons";
import { printScene } from "@anivo/script";
import { sceneSummary } from "@anivo/tools/summary";
import { useEffect, useRef, useState } from "react";
import guide from "../../../../prompts/scene-agent.md?raw";
import { type AiSettings, type ChatItem, DEFAULTS, type ProviderKind, newHistory } from "../ai/types.js";
import { loadAiSettings, saveAiSettings } from "../ai/settings.js";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  root: {
    position: "absolute",
    top: "8px",
    right: "8px",
    bottom: "8px",
    width: "380px",
    display: "flex",
    flexDirection: "column",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow28,
    zIndex: 11,
    overflow: "hidden",
  },
  head: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, padding: tokens.spacingVerticalS, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  title: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  log: { flexGrow: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, padding: tokens.spacingVerticalM },
  user: { alignSelf: "flex-end", maxWidth: "85%", padding: "6px 10px", borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorBrandBackground2, whiteSpace: "pre-wrap" },
  assistant: { whiteSpace: "pre-wrap" },
  tool: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  toolError: { color: tokens.colorPaletteRedForeground1 },
  input: { display: "flex", gap: tokens.spacingHorizontalXS, padding: tokens.spacingVerticalS, borderTop: `1px solid ${tokens.colorNeutralStroke2}`, alignItems: "flex-end" },
  settings: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, padding: tokens.spacingVerticalM, overflowY: "auto" },
  muted: { color: tokens.colorNeutralForeground3 },
});

const PROVIDERS: { value: ProviderKind; text: string }[] = [
  { value: "anthropic", text: "Anthropic (Claude)" },
  { value: "openai", text: "OpenAI-compatible endpoint" },
  { value: "ollama", text: "Ollama (on this computer)" },
];

/** The system prompt: the scene-agent guide and the current scene (docs/09 "AI panel", step 2). */
function systemPrompt(): string {
  const scene = useEditor.getState().scene;
  const body = guide.slice(Math.max(0, guide.indexOf("## 1. Role")));
  return `${body}\n\nYou work in the Anivo editor. The user sees each change at once and can undo it. Use the tools; do not ask for file paths.\n\n## The current scene\n\n${sceneSummary(scene)}\n\nAnivo Script:\n\n${printScene(scene)}`;
}

/** AI panel (FR-AGENT-10): a chat that changes the scene with the same tools as the MCP server. */
export function AiPanel() {
  const styles = useStyles();
  const open = useEditor((s) => s.aiOpen);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const history = useRef(newHistory());
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !settings) void loadAiSettings().then((s) => (setSettings(s), setShowSettings(!s.apiKey && s.provider !== "ollama")));
  }, [open]);
  useEffect(() => {
    // Element.scrollTo can return a Promise; an effect must not return it.
    void logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [items, streaming]);

  if (!open) return null;

  const send = async () => {
    const text = draft.trim();
    if (!text || !settings || busy) return;
    setDraft("");
    setItems((x) => [...x, { kind: "user", text }]);
    setBusy(true);
    const ac = new AbortController();
    abort.current = ac;
    try {
      const { chat } = await import("../ai/providers.js");
      await chat(settings, systemPrompt(), history.current, text, {
        onText: (d) => setStreaming((s) => s + d),
        onItem: (it) => {
          setStreaming("");
          setItems((x) => [...x, it]);
        },
      }, ac.signal);
    } catch (err) {
      if (!ac.signal.aborted) setItems((x) => [...x, { kind: "error", text: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setStreaming("");
      setBusy(false);
      abort.current = null;
    }
  };

  const update = (patch: Partial<AiSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  return (
    <section className={styles.root} aria-label="AI panel">
      <div className={styles.head}>
        <Text weight="semibold" className={styles.title}>
          AI · {settings ? `${PROVIDERS.find((p) => p.value === settings.provider)?.text.split(" ")[0]} ${settings.model}` : ""}
        </Text>
        <Button appearance="subtle" size="small" icon={<Settings20Regular />} aria-label="AI settings" onClick={() => setShowSettings((v) => !v)} />
        <Button appearance="subtle" size="small" onClick={() => ((history.current = newHistory()), setItems([]))} disabled={busy}>
          Clear
        </Button>
        <Button appearance="subtle" size="small" icon={<Dismiss20Regular />} aria-label="Close the AI panel" onClick={() => (abort.current?.abort(), useEditor.setState({ aiOpen: false }))} />
      </div>
      {showSettings && settings ? (
        <div className={styles.settings}>
          <Field label="Provider" size="small">
            <Dropdown
              size="small"
              value={PROVIDERS.find((p) => p.value === settings.provider)?.text ?? ""}
              selectedOptions={[settings.provider]}
              onOptionSelect={(_, d) => {
                const p = d.optionValue as ProviderKind;
                update({ provider: p, model: DEFAULTS[p].model, baseUrl: DEFAULTS[p].baseUrl });
              }}
            >
              {PROVIDERS.map((p) => (
                <Option key={p.value} value={p.value}>
                  {p.text}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Model" size="small">
            <Input size="small" value={settings.model} onChange={(_, d) => update({ model: d.value })} />
          </Field>
          {settings.provider !== "anthropic" && (
            <Field label="Base URL" size="small">
              <Input size="small" value={settings.baseUrl} onChange={(_, d) => update({ baseUrl: d.value })} />
            </Field>
          )}
          <Field label="API key" size="small" hint={settings.provider === "ollama" ? "Ollama needs no key." : undefined}>
            <Input size="small" type="password" value={settings.apiKey} onChange={(_, d) => update({ apiKey: d.value })} autoComplete="off" />
          </Field>
          <MessageBar intent="warning">
            <MessageBarBody>The key stays in this browser (IndexedDB). Other browser extensions can read it. Anivo never puts it in a scene file, a log, or a link. The requests go from this browser to the provider.</MessageBarBody>
          </MessageBar>
          <Button appearance="primary" onClick={() => void saveAiSettings(settings).then(() => setShowSettings(false))}>
            Save
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.log} ref={logRef} aria-live="polite">
            {items.length === 0 && !streaming && (
              <Text className={styles.muted}>Ask for a change, for example: "Add a cache between the load balancer and the pods, with a step that shows a cache hit."</Text>
            )}
            {items.map((it, i) =>
              it.kind === "tool" ? (
                <div key={i} className={mergeClasses(styles.tool, it.error && styles.toolError)} title={it.summary}>
                  ⚙ {it.summary}
                </div>
              ) : it.kind === "error" ? (
                <MessageBar key={i} intent="error">
                  <MessageBarBody>{it.text}</MessageBarBody>
                </MessageBar>
              ) : (
                <div key={i} className={it.kind === "user" ? styles.user : styles.assistant}>
                  {it.text}
                </div>
              ),
            )}
            {streaming && <div className={styles.assistant}>{streaming}</div>}
          </div>
          <div className={styles.input}>
            <Textarea
              style={{ flexGrow: 1 }}
              resize="vertical"
              value={draft}
              placeholder="Describe a change"
              aria-label="Message"
              onChange={(_, d) => setDraft(d.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            {busy ? (
              <Button icon={<Stop20Regular />} aria-label="Stop" onClick={() => abort.current?.abort()} />
            ) : (
              <Button appearance="primary" icon={<Send20Regular />} aria-label="Send" onClick={() => void send()} disabled={!draft.trim()} />
            )}
          </div>
        </>
      )}
    </section>
  );
}
