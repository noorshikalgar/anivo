import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { parseTranscriptJson } from "@anivo/ops";
import { useRef, useState } from "react";
import { ASR_MODELS, transcribeInBrowser, voiceOnsets } from "../asr/index.js";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";
import { SelectField } from "./fields.js";
import { formatTime } from "./PlaybackBar.js";

const useStyles = makeStyles({
  surface: { maxWidth: "640px", width: "100%" },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  muted: { color: tokens.colorNeutralForeground3 },
  list: { display: "flex", flexDirection: "column", gap: "2px", maxHeight: "240px", overflowY: "auto" },
  line: { display: "grid", gridTemplateColumns: "64px 1fr", gap: tokens.spacingHorizontalS },
  unmatched: { color: tokens.colorPaletteMarigoldForeground2 },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
});

type Words = { text: string; startMs: number; endMs: number }[];

/** Align the script lines to the voiceover (FR-AUDIO-04). */
export function AlignDialog() {
  const styles = useStyles();
  const open = useEditor((s) => s.alignOpen);
  const scene = useEditor((s) => s.scene);
  const [model, setModel] = useState(ASR_MODELS[0]!.id);
  const [status, setStatus] = useState<{ text: string; value?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const vo = scene.audio.find((t) => t.kind === "voiceover");
  const hasTranscript = (vo?.transcript?.words.length ?? 0) > 0;
  const linked = scene.script.filter((l) => l.stepId);
  const busy = status !== null;
  const size = ASR_MODELS.find((m) => m.id === model)?.sizeMb ?? 80;

  const close = () => {
    abort.current?.abort();
    setConfirm(false);
    setError(null);
    useEditor.setState({ alignOpen: false });
  };

  const align = async (words?: Words) => {
    // Speech onsets make the cues exact when the word times are late.
    const onsets = vo ? await voiceOnsets(vo.assetId).catch(() => undefined) : undefined;
    const r = useEditor.getState().apply({ label: "Align script", ops: [{ op: "script.align", ...(words ? { words } : {}), ...(onsets?.length ? { onsets } : {}) }] });
    if (!r.ok) {
      setError(r.error.hint ? `${r.error.message} ${r.error.hint}` : r.error.message);
      return;
    }
    const s = useEditor.getState().scene;
    const bad = s.script.filter((l) => l.unmatched).length;
    notify(`Aligned ${s.script.length - bad} of ${s.script.length} lines`, bad ? "info" : "success");
  };

  async function transcribe() {
    if (!vo) return;
    setConfirm(false);
    setError(null);
    const ac = new AbortController();
    abort.current = ac;
    setStatus({ text: "Preparing the audio…" });
    try {
      const words = await transcribeInBrowser(vo.assetId, {
        model,
        signal: ac.signal,
        onStatus: (m) => {
          if (m.type === "download") setStatus({ text: `Downloading the speech model: ${(m.loaded / 1e6).toFixed(0)} of ${(m.total / 1e6).toFixed(0)} MB`, ...(m.total ? { value: m.loaded / m.total } : {}) });
          else if (m.type === "transcribing") setStatus({ text: "Transcribing the voiceover. This can take some minutes." });
        },
      });
      if (words.length === 0) throw new Error("The speech recognition found no words in the voiceover.");
      await align(words);
    } catch (err) {
      if (!ac.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus(null);
      abort.current = null;
    }
  }

  async function importTranscript() {
    setError(null);
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
      await align(parseTranscriptJson(JSON.parse(await file.text())));
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(" | ", " "));
    }
  }

  const order = new Map(scene.steps.map((s, i) => [s.id, i]));
  const rows = scene.script.map((l) => {
    const step = l.stepId !== undefined ? scene.steps[order.get(l.stepId) ?? -1] : undefined;
    return { l, at: step?.trigger.kind === "cue" ? step.trigger.atMs : null };
  });

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()} modalType="modal">
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Align script to voiceover</DialogTitle>
          <DialogContent className={styles.content}>
            {!vo ? (
              <MessageBar intent="info">
                <MessageBarBody>Add or record a voiceover first.</MessageBarBody>
              </MessageBar>
            ) : linked.length === 0 ? (
              <MessageBar intent="info">
                <MessageBarBody>Write the script first (Audio › Edit script). Each line links to a step.</MessageBarBody>
              </MessageBar>
            ) : (
              <>
                <Text size={200} className={styles.muted}>
                  Anivo finds the words of each script line in the voiceover and starts its step at that time. The voiceover stays on this computer.
                </Text>
                <SelectField label="Speech model" value={model} options={ASR_MODELS.map((m) => ({ value: m.id, text: `${m.label}, about ${m.sizeMb} MB` }))} onCommit={setModel} />
                {confirm && (
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      Anivo will download the speech model (about {size} MB) from Hugging Face one time. The browser keeps it for the next time. Continue?
                    </MessageBarBody>
                  </MessageBar>
                )}
                <div className={styles.actions}>
                  {confirm ? (
                    <>
                      <Button appearance="primary" onClick={() => void transcribe()}>
                        Download and transcribe
                      </Button>
                      <Button onClick={() => setConfirm(false)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <Button appearance="primary" disabled={busy} onClick={() => setConfirm(true)}>
                        Transcribe in this browser
                      </Button>
                      <Button disabled={busy} onClick={() => void importTranscript()}>
                        Import transcript…
                      </Button>
                      {hasTranscript && (
                        <Button disabled={busy} onClick={() => void align()}>
                          Align again
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {status && <ProgressBar {...(status.value !== undefined ? { value: status.value } : {})} thickness="large" aria-label="Transcription progress" />}
                {status && <Text size={200}>{status.text}</Text>}
                {error && (
                  <MessageBar intent="error">
                    <MessageBarBody>{error}</MessageBarBody>
                  </MessageBar>
                )}
                {hasTranscript && (
                  <div className={styles.list} aria-label="Script lines">
                    {rows.map(({ l, at }) => (
                      <div key={l.id} className={styles.line}>
                        <Text size={200} className={l.unmatched ? styles.unmatched : undefined}>
                          {l.unmatched ? "No match" : at !== null ? formatTime(at) : "—"}
                        </Text>
                        <Text size={200} className={l.unmatched ? styles.unmatched : undefined}>
                          {l.text}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close}>
              {busy ? "Cancel" : "Close"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
