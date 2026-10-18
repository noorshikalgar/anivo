import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, ProgressBar, Text } from "@fluentui/react-components";
import { useEffect, useRef, useState } from "react";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";
import { type TtsSettings, TTS_DEFAULTS, generateVoiceover, loadTtsSettings, saveTtsSettings } from "../tts.js";

/** Make the voiceover from the script with a speech service (FR-AUDIO-08). */
export function TtsDialog() {
  const open = useEditor((s) => s.ttsOpen);
  const [s, setS] = useState<TtsSettings>(TTS_DEFAULTS);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (open) void loadTtsSettings().then(setS);
    setError(null);
  }, [open]);
  const close = () => {
    abort.current?.abort();
    useEditor.setState({ ttsOpen: false });
  };
  const run = async () => {
    setError(null);
    setProgress(0);
    const ac = new AbortController();
    abort.current = ac;
    try {
      await saveTtsSettings(s);
      const n = await generateVoiceover(s, (d, t) => setProgress(d / t), ac.signal);
      notify(`Made the voiceover: ${n} lines, with a cue for each step`, "success");
      useEditor.setState({ ttsOpen: false });
    } catch (err) {
      if (!ac.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };
  const field = (label: string, key: keyof TtsSettings, type?: "password") => (
    <Field label={label} size="small">
      <Input size="small" type={type ?? "text"} value={s[key]} autoComplete="off" onChange={(_, d) => setS({ ...s, [key]: d.value })} />
    </Field>
  );
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface aria-label="Voiceover from script" style={{ maxWidth: 520 }}>
        <DialogBody>
          <DialogTitle>Make the voiceover from the script</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Text size={200}>Each script line becomes speech. Each step starts when its line starts. The service gets the script text; it does not get the diagram.</Text>
            {field("Service URL (OpenAI-compatible)", "baseUrl")}
            {field("API key", "apiKey", "password")}
            {field("Model", "model")}
            {field("Voice", "voice")}
            <Text size={200}>The key stays in this browser (IndexedDB). Other browser extensions can read it. A local speech server with the same API needs no key.</Text>
            {progress !== null && <ProgressBar value={progress} aria-label="Speech progress" />}
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Cancel</Button>
            <Button appearance="primary" disabled={progress !== null} onClick={() => void run()}>
              Make voiceover
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
