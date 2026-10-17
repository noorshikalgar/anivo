import { estimateGifBytes, exportGifWeb, exportVideoWeb, renderPngWeb, supportedFormats } from "@anivo/export-web";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Radio,
  RadioGroup,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { zipSync } from "fflate";
import { useEffect, useMemo, useRef, useState } from "react";
import { notify } from "../notify.js";
import { useEditor } from "../store.js";
import { Row, SelectField } from "./fields.js";

const useStyles = makeStyles({
  surface: { maxWidth: "560px", width: "100%" },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  formats: { display: "grid", gridTemplateColumns: "1fr 1fr" },
  muted: { color: tokens.colorNeutralForeground3 },
});

type Format = "mp4" | "webm" | "gif" | "png" | "png-steps";

const FORMATS: { value: Format; text: string; note: string }[] = [
  { value: "mp4", text: "MP4 video", note: "H.264. Works in all video editors." },
  { value: "webm", text: "WebM video", note: "VP9. Keeps transparency if the background is transparent." },
  { value: "gif", text: "GIF", note: "For a README or docs. Large for long videos." },
  { value: "png", text: "PNG image", note: "The frame at the playhead." },
  { value: "png-steps", text: "PNG of each step", note: "End state of each step, in one ZIP file." },
];

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function download(data: BlobPart, name: string, type: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

function baseName(title: string): string {
  return title.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "anivo";
}

export function ExportDialog() {
  const styles = useStyles();
  const open = useEditor((s) => s.exportOpen);
  const scene = useEditor((s) => s.scene);
  const timeline = useEditor((s) => s.timeline);
  const [format, setFormat] = useState<Format>("mp4");
  const [scale, setScale] = useState("1");
  const [fps, setFps] = useState<"24" | "30" | "60">(String(scene.settings.video.fps) as "24" | "30" | "60");
  const [gifWidth, setGifWidth] = useState("800");
  const [gifFps, setGifFps] = useState("15");
  const [quality, setQuality] = useState<"draft" | "standard" | "high">("standard");
  const [from, setFrom] = useState("0");
  const [to, setTo] = useState(String(Math.max(0, scene.steps.length - 1)));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<string[]>(["mp4", "webm"]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(String(Math.max(0, scene.steps.length - 1)));
    setFrom("0");
    setError(null);
    void supportedFormats(scene.settings.video.width, scene.settings.video.height).then(setSupported);
  }, [open]);

  const v = scene.settings.video;
  const width = even(v.width * Number(scale));
  const height = even(v.height * Number(scale));
  const stepOptions = scene.steps.map((s, i) => ({ value: String(i), text: `${i + 1}. ${s.title || s.id}` }));
  const range = useMemo(() => {
    if (timeline.steps.length === 0) return { startMs: 0, endMs: 0 };
    const a = Math.min(Number(from), Number(to));
    const b = Math.max(Number(from), Number(to));
    return { startMs: timeline.steps[a]!.startMs, endMs: timeline.steps[b]!.holdEndMs };
  }, [timeline, from, to]);
  const seconds = (range.endMs - range.startMs) / 1000;
  const gifH = Math.round((Number(gifWidth) * v.height) / v.width);
  const gifEstimate = estimateGifBytes(Number(gifWidth), gifH, Math.ceil(seconds * Number(gifFps)));
  const transparent = scene.settings.background.kind === "transparent";
  const busy = progress !== null;
  const name = baseName(scene.meta.title);

  const close = () => {
    abort.current?.abort();
    useEditor.setState({ exportOpen: false });
  };

  async function run() {
    setError(null);
    const ac = new AbortController();
    abort.current = ac;
    setProgress(0);
    const onProgress = (d: number, n: number) => setProgress(d / n);
    try {
      if (format === "mp4" || format === "webm") {
        const r = await exportVideoWeb(scene, { format, width, height, fps: Number(fps) as 24 | 30 | 60, range, quality, onProgress, signal: ac.signal });
        download(r.data as BlobPart, `${name}.${format}`, r.mimeType);
      } else if (format === "gif") {
        const r = await exportGifWeb(scene, { width: Number(gifWidth), height: gifH, fps: Number(gifFps), range, onProgress, signal: ac.signal });
        download(r.data as BlobPart, `${name}.gif`, "image/gif");
      } else if (format === "png") {
        const st = useEditor.getState();
        const t = !st.playing && st.selectedStep === null && st.playhead === 0 ? -1 : st.playhead;
        download(await renderPngWeb(scene, t, width, height), `${name}.png`, "image/png");
      } else {
        const files: Record<string, Uint8Array> = {};
        const a = Math.min(Number(from), Number(to));
        const b = Math.max(Number(from), Number(to));
        for (let i = a; i <= b; i++) {
          const blob = await renderPngWeb(scene, timeline.steps[i]!.endMs, width, height);
          files[`${String(i + 1).padStart(2, "0")}-${scene.steps[i]!.id}.png`] = new Uint8Array(await blob.arrayBuffer());
          setProgress((i - a + 1) / (b - a + 1));
        }
        download(zipSync(files, { level: 0 }) as BlobPart, `${name}-steps.zip`, "application/zip");
      }
      notify("Export finished", "success");
      useEditor.setState({ exportOpen: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!ac.signal.aborted) setError(msg);
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }

  const needsSteps = format !== "png";
  const noSteps = scene.steps.length === 0 && needsSteps;
  const unsupported = (format === "mp4" || format === "webm") && !supported.includes(format);

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()} modalType="modal">
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Export</DialogTitle>
          <DialogContent className={styles.content}>
            <Field label="Format">
              <RadioGroup className={styles.formats} value={format} onChange={(_, d) => setFormat(d.value as Format)} disabled={busy}>
                {FORMATS.map((f) => (
                  <Radio key={f.value} value={f.value} label={f.text} />
                ))}
              </RadioGroup>
            </Field>
            <Text size={200} className={styles.muted}>
              {FORMATS.find((f) => f.value === format)?.note}
            </Text>

            {format === "gif" ? (
              <Row>
                <SelectField label="Width" value={gifWidth} options={["480", "640", "800", "1024", "1280"].map((w) => ({ value: w, text: `${w} px` }))} onCommit={setGifWidth} />
                <SelectField label="Frame rate" value={gifFps} options={["10", "15", "20", "30"].map((f) => ({ value: f, text: `${f} fps` }))} onCommit={setGifFps} />
              </Row>
            ) : (
              <Row>
                <SelectField
                  label="Size"
                  value={scale}
                  options={["0.5", "0.6667", "1", "1.3333", "2"].map((s) => ({ value: s, text: `${even(v.width * Number(s))} × ${even(v.height * Number(s))}` }))}
                  onCommit={setScale}
                />
                {format === "mp4" || format === "webm" ? (
                  <SelectField label="Frame rate" value={fps} options={(["24", "30", "60"] as const).map((f) => ({ value: f, text: `${f} fps` }))} onCommit={setFps} />
                ) : (
                  <div />
                )}
              </Row>
            )}
            {(format === "mp4" || format === "webm") && (
              <SelectField
                label="Quality"
                value={quality}
                options={[
                  { value: "draft", text: "Draft (fast, small file)" },
                  { value: "standard", text: "Standard" },
                  { value: "high", text: "High (large file)" },
                ]}
                onCommit={setQuality}
              />
            )}
            {needsSteps && scene.steps.length > 0 && (
              <Row>
                <SelectField label="From step" value={from} options={stepOptions} onCommit={setFrom} />
                <SelectField label="To step" value={to} options={stepOptions} onCommit={setTo} />
              </Row>
            )}
            {format !== "png" && format !== "png-steps" && (
              <Text size={200} className={styles.muted}>
                {seconds.toFixed(1)} s of video
                {format === "gif" ? ` · about ${(gifEstimate / 1e6).toFixed(1)} MB` : ""}
              </Text>
            )}
            {format === "gif" && gifEstimate > 15e6 && (
              <MessageBar intent="warning">
                <MessageBarBody>The GIF will be large. Use a smaller width, a lower frame rate, or fewer steps.</MessageBarBody>
              </MessageBar>
            )}
            {format === "mp4" && transparent && (
              <MessageBar intent="warning">
                <MessageBarBody>MP4 cannot store transparency. Use WebM to keep a transparent background.</MessageBarBody>
              </MessageBar>
            )}
            {unsupported && (
              <MessageBar intent="error">
                <MessageBarBody>This browser cannot encode {format.toUpperCase()} at this size. Use the other video format, a smaller size, or Chrome.</MessageBarBody>
              </MessageBar>
            )}
            {noSteps && (
              <MessageBar intent="info">
                <MessageBarBody>The scene has no steps. Add a step to export a video.</MessageBarBody>
              </MessageBar>
            )}
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {busy && <ProgressBar value={progress ?? 0} thickness="large" aria-label="Export progress" />}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close}>
              {busy ? "Cancel export" : "Cancel"}
            </Button>
            <Button appearance="primary" onClick={() => void run()} disabled={busy || noSteps || unsupported}>
              {busy ? `Exporting ${Math.round((progress ?? 0) * 100)}%` : "Export"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
