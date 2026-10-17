import { evaluate } from "@anivo/engine";
import type { Element } from "@anivo/schema";
import { Button, Divider, Slider, Field, Text, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import {
  ArrowDown20Regular,
  ArrowMaximizeVertical20Regular,
  ArrowMinimizeVertical20Regular,
  ArrowUp20Regular,
  Copy20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import { useMemo } from "react";
import { commitProps, commitSettings, deleteSelection, duplicateSelection, renameElement, reorderSelection, setElementText } from "../commands.js";
import { useEditor } from "../store.js";
import { ColorField, NumberField, Row, SelectField, TextField } from "./fields.js";

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingHorizontalM,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  heading: { color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXS },
  muted: { color: tokens.colorNeutralForeground3 },
  actions: { display: "flex", gap: "2px", flexWrap: "wrap" },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

const SHAPES = new Set(["rectangle", "ellipse", "diamond", "line"]);

function finalColor(c: unknown): string | undefined {
  if (c === undefined) return undefined;
  return typeof c === "string" ? c : (c as { to: string }).to;
}

function ElementProperties({ el }: { el: Element }) {
  const styles = useStyles();
  const scene = useEditor((s) => s.scene);
  const playhead = useEditor((s) => s.playhead);
  const selectedStep = useEditor((s) => s.selectedStep);
  const playing = useEditor((s) => s.playing);
  // Show the values at the current time, so morphs in a step show their result.
  const f = useMemo(() => {
    const t = !playing && selectedStep === null && playhead === 0 ? -1 : playhead;
    return evaluate(scene, t).elements.find((e) => e.id === el.id);
  }, [scene, playhead, selectedStep, playing, el.id]);
  if (!f) return null;
  const theme = scene.settings.theme;
  const set = (changes: Record<string, unknown>, label?: string) => commitProps(el.id, changes, label);
  const text = el.type === "text" ? el.content.text : (f.label ?? "");

  return (
    <>
      <TextField label="ID" value={el.id} onCommit={(v) => renameElement(el.id, v)} />
      <Text size={200} className={styles.muted}>
        {el.type}
        {el.type === "icon" ? ` · ${el.pack}:${el.name}` : ""}
      </Text>
      {selectedStep !== null && <Text className={styles.note}>Changes to position, size, color, and label in a step become a morph in that step.</Text>}
      {el.type !== "connector" && (
        <TextField
          label={el.type === "text" ? "Text" : "Label"}
          multiline
          value={text}
          placeholder="No label"
          onCommit={(v) => (el.type === "text" ? setElementText(el.id, v) : set({ label: v }, "Edit label"))}
        />
      )}

      {el.type !== "connector" && (
        <>
          <Text size={200} weight="semibold" className={styles.heading}>
            Position and size
          </Text>
          <Row>
            <NumberField label="X" value={f.x} onCommit={(v) => set({ x: v }, "Move element")} />
            <NumberField label="Y" value={f.y} onCommit={(v) => set({ y: v }, "Move element")} />
          </Row>
          <Row>
            <NumberField label="Width" value={f.width} min={8} onCommit={(v) => set({ width: v }, "Resize element")} />
            <NumberField label="Height" value={f.height} min={8} onCommit={(v) => set({ height: v }, "Resize element")} />
          </Row>
        </>
      )}

      <Text size={200} weight="semibold" className={styles.heading}>
        Appearance
      </Text>
      {SHAPES.has(el.type) && el.type !== "line" && <ColorField label="Fill" theme={theme} value={finalColor(f.fill)} onCommit={(v) => set({ fill: v }, "Change fill")} />}
      {el.type !== "text" && <ColorField label={el.type === "icon" ? "Icon color" : "Stroke"} theme={theme} value={finalColor(f.stroke)} onCommit={(v) => set({ stroke: v }, "Change stroke")} />}
      {(SHAPES.has(el.type) || el.type === "connector") && (
        <Row>
          <NumberField label="Stroke width" value={f.strokeWidth ?? 2} min={0} max={40} onCommit={(v) => set({ strokeWidth: v }, "Change stroke width")} />
          <SelectField
            label="Stroke style"
            value={el.style.strokeStyle ?? "solid"}
            options={[
              { value: "solid", text: "Solid" },
              { value: "dashed", text: "Dashed" },
              { value: "dotted", text: "Dotted" },
            ]}
            onCommit={(v) => set({ strokeStyle: v }, "Change stroke style")}
          />
        </Row>
      )}
      {el.type === "rectangle" && <NumberField label="Corner radius" value={f.cornerRadius ?? 12} min={0} max={200} onCommit={(v) => set({ cornerRadius: v }, "Change corner radius")} />}
      {el.type === "connector" && (
        <>
          <SelectField
            label="Route"
            value={el.route}
            options={[
              { value: "straight", text: "Straight" },
              { value: "elbow", text: "Elbow" },
              { value: "curved", text: "Curved" },
            ]}
            onCommit={(v) => set({ route: v }, "Change route")}
          />
          <Row>
            {(["startHead", "endHead"] as const).map((k) => (
              <SelectField
                key={k}
                label={k === "startHead" ? "Start" : "End"}
                value={el[k]}
                options={[
                  { value: "none", text: "None" },
                  { value: "arrow", text: "Arrow" },
                  { value: "triangle", text: "Triangle" },
                  { value: "dot", text: "Dot" },
                  { value: "bar", text: "Bar" },
                ]}
                onCommit={(v) => set({ [k]: v }, "Change arrowhead")}
              />
            ))}
          </Row>
        </>
      )}
      {(el.label || el.type === "text") && (
        <Row>
          <NumberField label="Font size" value={f.fontSize ?? 32} min={8} max={400} onCommit={(v) => set({ fontSize: v }, "Change font size")} />
          <SelectField
            label="Align"
            value={el.style.textAlign ?? "center"}
            options={[
              { value: "left", text: "Left" },
              { value: "center", text: "Center" },
              { value: "right", text: "Right" },
            ]}
            onCommit={(v) => set({ textAlign: v }, "Change text align")}
          />
        </Row>
      )}
      {(el.label || el.type === "text") && <ColorField label="Text color" theme={theme} value={finalColor(f.textColor)} onCommit={(v) => set({ textColor: v }, "Change text color")} />}
      <Field label={`Opacity ${Math.round(f.opacity * 100)}%`} size="small">
        <Slider size="small" min={0} max={100} value={Math.round(f.opacity * 100)} onChange={(_, d) => set({ opacity: d.value / 100 }, "Change opacity")} aria-label="Opacity" />
      </Field>

      <Divider />
      <div className={styles.actions}>
        <Tooltip content="Bring to front" relationship="label">
          <Button size="small" appearance="subtle" icon={<ArrowMaximizeVertical20Regular />} onClick={() => reorderSelection("front")} />
        </Tooltip>
        <Tooltip content="Bring forward" relationship="label">
          <Button size="small" appearance="subtle" icon={<ArrowUp20Regular />} onClick={() => reorderSelection("forward")} />
        </Tooltip>
        <Tooltip content="Send backward" relationship="label">
          <Button size="small" appearance="subtle" icon={<ArrowDown20Regular />} onClick={() => reorderSelection("backward")} />
        </Tooltip>
        <Tooltip content="Send to back" relationship="label">
          <Button size="small" appearance="subtle" icon={<ArrowMinimizeVertical20Regular />} onClick={() => reorderSelection("back")} />
        </Tooltip>
        <Tooltip content="Duplicate (Ctrl+D)" relationship="label">
          <Button size="small" appearance="subtle" icon={<Copy20Regular />} onClick={duplicateSelection} />
        </Tooltip>
        <Tooltip content="Delete (Delete)" relationship="label">
          <Button size="small" appearance="subtle" icon={<Delete20Regular />} onClick={deleteSelection} />
        </Tooltip>
      </div>
    </>
  );
}

const VIDEO_SIZES = [
  { value: "1920x1080", text: "1920 × 1080 (16:9)" },
  { value: "1280x720", text: "1280 × 720 (16:9)" },
  { value: "3840x2160", text: "3840 × 2160 (4K)" },
  { value: "1080x1920", text: "1080 × 1920 (9:16)" },
  { value: "1080x1080", text: "1080 × 1080 (1:1)" },
  { value: "1080x1350", text: "1080 × 1350 (4:5)" },
];

function SceneProperties() {
  const styles = useStyles();
  const meta = useEditor((s) => s.scene.meta);
  const settings = useEditor((s) => s.scene.settings);
  const size = `${settings.video.width}x${settings.video.height}`;
  return (
    <>
      <TextField label="Title" value={meta.title} onCommit={(v) => void useEditor.getState().apply({ label: "Rename scene", ops: [{ op: "scene.meta", set: { title: v } }] })} />
      <Text size={200} weight="semibold" className={styles.heading}>
        Look
      </Text>
      <SelectField
        label="Style"
        value={settings.style}
        options={[
          { value: "clean", text: "Clean" },
          { value: "sketch", text: "Sketch (hand-drawn)" },
        ]}
        onCommit={(v) => commitSettings({ style: v }, "Change style")}
      />
      <SelectField
        label="Theme"
        value={settings.theme}
        options={[
          { value: "slate-dark", text: "Slate dark" },
          { value: "slate-light", text: "Slate light" },
        ]}
        onCommit={(v) => commitSettings({ theme: v }, "Change theme")}
      />
      <SelectField
        label="Background"
        value={settings.background.kind}
        options={[
          { value: "solid", text: "Solid" },
          { value: "grid", text: "Grid" },
          { value: "dots", text: "Dots" },
          { value: "transparent", text: "Transparent" },
        ]}
        onCommit={(v) => commitSettings({ background: { kind: v } }, "Change background")}
      />
      <Text size={200} weight="semibold" className={styles.heading}>
        Video
      </Text>
      <SelectField
        label="Size"
        value={VIDEO_SIZES.some((o) => o.value === size) ? size : "1920x1080"}
        options={VIDEO_SIZES}
        onCommit={(v) => {
          const [width, height] = v.split("x").map(Number);
          commitSettings({ video: { width, height } }, "Change video size");
        }}
      />
      <SelectField
        label="Frame rate"
        value={String(settings.video.fps) as "24" | "30" | "60"}
        options={[
          { value: "24", text: "24 fps" },
          { value: "30", text: "30 fps" },
          { value: "60", text: "60 fps" },
        ]}
        onCommit={(v) => commitSettings({ video: { fps: Number(v) } }, "Change frame rate")}
      />
    </>
  );
}

export function Inspector() {
  const styles = useStyles();
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => s.scene.elements);
  const el = selection.length === 1 ? elements[selection[0]!] : undefined;

  return (
    <aside className={styles.root} aria-label="Inspector">
      <Text weight="semibold" size={200} className={styles.muted}>
        {el ? "Element" : selection.length > 1 ? "Selection" : "Scene"}
      </Text>
      {el ? (
        <ElementProperties key={el.id} el={el} />
      ) : selection.length > 1 ? (
        <Text size={200} className={styles.muted}>
          {selection.length} elements selected.
        </Text>
      ) : (
        <SceneProperties />
      )}
    </aside>
  );
}
