import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Text, makeStyles, tokens } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { useEditor } from "../store.js";

const KEY = "anivo.tourDone";

const SCREENS = [
  { title: "Welcome to Anivo", text: "Anivo makes explainer videos from diagrams. Draw boxes, arrows, icons, and text on the canvas, or start from a template (File › New from template)." },
  { title: "Base state and steps", text: "The base state is what shows before the video starts. Each step in the left panel adds one change: elements enter, move, glow, or exit. Select a step, then select elements and click Add action." },
  { title: "Timing", text: "Press Space to play. The timeline button at the bottom shows a bar for each action: drag a bar to change its delay, or its edge to change its duration." },
  { title: "Voice and captions", text: "Audio › Record voiceover records your voice while you click through the steps. Audio › Edit script gives one line for each step; the lines become captions, and alignment puts each step on its words." },
  { title: "Export and share", text: "Export makes MP4, WebM, GIF, PNG, or one HTML file. Agents can make the same videos with the anivo CLI and the MCP server. Press Ctrl+K for all commands." },
] as const;

const useStyles = makeStyles({
  surface: { maxWidth: "520px", width: "100%" },
  dots: { display: "flex", gap: "6px", marginTop: tokens.spacingVerticalM },
  dot: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: tokens.colorNeutralStroke1 },
  on: { backgroundColor: tokens.colorBrandBackground },
  spacer: { flexGrow: 1 },
});

function done(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

/** First-run tour, 5 screens (FR-UX-04). The user can skip it. Command: Show the tour. */
export function Tour() {
  const styles = useStyles();
  const open = useEditor((s) => s.tourOpen);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!done()) useEditor.setState({ tourOpen: true });
  }, []);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // No storage: the tour shows again next time.
    }
    useEditor.setState({ tourOpen: false });
  };
  const s = SCREENS[i]!;
  const last = i === SCREENS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface} aria-label="Tour">
        <DialogBody>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogContent>
            <Text as="p">{s.text}</Text>
            <div className={styles.dots} aria-label={`Screen ${i + 1} of ${SCREENS.length}`} role="img">
              {SCREENS.map((_, k) => (
                <span key={k} className={`${styles.dot} ${k === i ? styles.on : ""}`} />
              ))}
            </div>
          </DialogContent>
          <DialogActions fluid>
            <Button appearance="subtle" onClick={close}>
              Skip
            </Button>
            <span className={styles.spacer} />
            {i > 0 && <Button onClick={() => setI(i - 1)}>Back</Button>}
            <Button appearance="primary" onClick={() => (last ? close() : setI(i + 1))}>
              {last ? "Start" : "Next"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
