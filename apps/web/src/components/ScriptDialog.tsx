import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Text, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { setScriptText } from "../audio.js";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";

const useStyles = makeStyles({
  surface: { maxWidth: "640px", width: "100%" },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  text: { minHeight: "280px", fontFamily: tokens.fontFamilyBase },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** Edit the voiceover script: one line for each step (FR-AUDIO-03). */
export function ScriptDialog() {
  const styles = useStyles();
  const open = useEditor((s) => s.scriptOpen);
  const steps = useEditor((s) => s.scene.steps.length);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    const { scene } = useEditor.getState();
    // Lines in step order; lines with no step go last.
    const order = new Map(scene.steps.map((s, i) => [s.id, i]));
    const lines = [...scene.script].sort((a, b) => (order.get(a.stepId ?? "") ?? 1e9) - (order.get(b.stepId ?? "") ?? 1e9));
    setText(lines.map((l) => l.text).join("\n"));
  }, [open]);

  const count = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const close = () => useEditor.setState({ scriptOpen: false });

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()} modalType="modal">
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Script</DialogTitle>
          <DialogContent className={styles.content}>
            <Field label="Voiceover script" hint="Write one line for each step, in order. Captions use these lines.">
              <Textarea className={styles.text} value={text} onChange={(_, d) => setText(d.value)} resize="vertical" />
            </Field>
            <Text size={200} className={styles.muted}>
              {count} lines, {steps} steps.
              {count > steps ? ` ${count - steps} lines have no step.` : ""}
              {count < steps ? ` ${steps - count} steps have no line.` : ""}
            </Text>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={() => {
                setScriptText(text);
                notify("Script set", "success");
                close();
              }}
            >
              Set script
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
