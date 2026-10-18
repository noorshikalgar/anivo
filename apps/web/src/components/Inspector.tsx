import { evaluate } from "@anivo/engine";
import type { Element } from "@anivo/schema";
import { Button, Divider, Slider, Field, MessageBar, MessageBarActions, MessageBarBody, Switch, Text, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import {
  AlignBottom20Regular,
  AlignCenterHorizontal20Regular,
  AlignCenterVertical20Regular,
  AlignLeft20Regular,
  AlignRight20Regular,
  AlignTop20Regular,
  AlignSpaceEvenlyHorizontal20Regular,
  AlignSpaceEvenlyVertical20Regular,
  Group20Regular,
  GroupDismiss20Regular,
  ArrowDown20Regular,
  ArrowMaximizeVertical20Regular,
  ArrowMinimizeVertical20Regular,
  ArrowUp20Regular,
  Copy20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import { useMemo } from "react";
import { type AlignKind, alignSelection, autoLayoutSelection, commitProps, commitSettings, deleteSelection, distributeSelection, duplicateSelection, groupSelection, renameElement, reorderSelection, setElementText, ungroupSelection } from "../commands.js";
import { useEditor } from "../store.js";
import { Comments } from "./Comments.js";
import { ColorField, NumberField, Row, SelectField, TextField } from "./fields.js";
import { AddActionMenu, StepInspector } from "./StepInspector.js";

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
  const timeline = useEditor((s) => s.timeline);
  // Base edits: morphs of earlier steps can set the same properties at the playhead, so the change does not show here.
  const overrides = useMemo(() => {
    if (selectedStep !== null || playing || playhead <= 0) return [];
    // The last morph of each property wins.
    const last = new Map<string, string>();
    for (const s of timeline.steps) for (const ta of s.actions) if (ta.action.type === "morph" && ta.target === el.id && ta.startMs <= playhead) for (const k of Object.keys(ta.action.to)) last.set(k, s.id);
    const out: { stepId: string; title: string; keys: string[] }[] = [];
    for (const [k, stepId] of last) {
      const o = out.find((x) => x.stepId === stepId);
      if (o) o.keys.push(k);
      else out.push({ stepId, title: scene.steps.find((x) => x.id === stepId)?.title ?? stepId, keys: [k] });
    }
    return out;
  }, [timeline, scene.steps, selectedStep, playing, playhead, el.id]);
  if (!f) return null;
  const theme = scene.settings.theme;
  const set = (changes: Record<string, unknown>, label?: string) => commitProps(el.id, changes, label);
  // The text at the playhead: in a step, a morph can change it.
  const text = f.label ?? "";

  return (
    <>
      <TextField label="ID" value={el.id} onCommit={(v) => renameElement(el.id, v)} />
      <Row>
        <Switch label="Locked" checked={el.locked} onChange={(_, d) => set({ locked: d.checked }, d.checked ? "Lock" : "Unlock")} />
        <Tooltip content="Hide in the editor only. The video still shows it." relationship="description">
          <Switch label="Hidden in editor" checked={el.editorHidden} onChange={(_, d) => set({ editorHidden: d.checked }, d.checked ? "Hide in editor" : "Show in editor")} />
        </Tooltip>
      </Row>
      <Text size={200} className={styles.muted}>
        {el.type}
        {el.type === "icon" ? ` · ${el.pack}:${el.name}` : ""}
      </Text>
      {overrides.length > 0 && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            At this time, {overrides.map((o) => `step "${o.title}" sets ${o.keys.join(", ")}`).join("; ")}. Your change to {overrides.length > 1 ? "these properties" : overrides[0]!.keys.length > 1 ? "these properties" : "it"} changes the element before that step only.
          </MessageBarBody>
          <MessageBarActions>
            <Button size="small" onClick={() => useEditor.getState().selectStep(overrides.at(-1)!.stepId)}>
              Go to step "{overrides.at(-1)!.title}"
            </Button>
          </MessageBarActions>
        </MessageBar>
      )}
      {selectedStep !== null && (
        <>
          <MessageBar intent="info" layout="multiline">
            <MessageBarBody>Changes to position, size, color, and label animate in this step (a morph). To change the element in all steps, select Base in the step list.</MessageBarBody>
          </MessageBar>
          <div>
            <AddActionMenu />
          </div>
        </>
      )}
      {el.type === "code" && (
        <>
          <TextField label="Code" multiline value={el.code} onCommit={(v) => void useEditor.getState().apply({ label: "Edit code", ops: [{ op: "element.update", id: el.id, set: { code: v } }] })} />
          <SelectField
            label="Language"
            value={el.language as "ts"}
            options={["ts", "js", "py", "go", "rust", "java", "sql", "bash", "yaml", "json"].map((l) => ({ value: l as "ts", text: l }))}
            onCommit={(v) => set({ language: v }, "Change language")}
          />
        </>
      )}
      {el.type === "table" && (
        <>
          <Row>
            <NumberField label="Rows" value={el.rows} min={1} max={50} onCommit={(v) => set({ rows: Math.round(v) }, "Change rows")} />
            <NumberField label="Columns" value={el.cols} min={1} max={20} onCommit={(v) => set({ cols: Math.round(v) }, "Change columns")} />
          </Row>
          <SelectField
            label="Header row"
            value={el.header ? "on" : "off"}
            options={[
              { value: "on", text: "Row 1 is a header" },
              { value: "off", text: "No header" },
            ]}
            onCommit={(v) => set({ header: v === "on" }, "Change header")}
          />
        </>
      )}
      {el.type === "image" && (
        <SelectField
          label="Fit"
          value={el.fit}
          options={[
            { value: "contain", text: "Contain (show all)" },
            { value: "cover", text: "Cover (fill and cut)" },
            { value: "fill", text: "Stretch" },
          ]}
          onCommit={(v) => void useEditor.getState().apply({ label: "Change fit", ops: [{ op: "element.update", id: el.id, set: { fit: v } }] })}
        />
      )}
      {el.type !== "connector" && el.type !== "code" && el.type !== "image" && el.type !== "table" && (
        <TextField
          label={el.type === "text" ? "Text" : "Label"}
          multiline
          value={text}
          placeholder="No label"
          onCommit={(v) => (el.type === "text" && selectedStep === null ? setElementText(el.id, v) : set({ label: v }, el.type === "text" ? "Edit text" : "Edit label"))}
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
      {(el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond") && selectedStep !== null && (
        <SelectField
          label="Shape in this step"
          value={(f.shape ?? el.type) as "rectangle"}
          options={[
            { value: "rectangle", text: "Rectangle" },
            { value: "ellipse", text: "Ellipse" },
            { value: "diamond", text: "Diamond" },
          ]}
          onCommit={(v) => set({ shape: v }, "Change shape")}
        />
      )}
      {(el.type === "rectangle" || el.type === "image") && <NumberField label="Corner radius" value={f.cornerRadius ?? (el.type === "image" ? 0 : 12)} min={0} max={200} onCommit={(v) => set({ cornerRadius: v }, "Change corner radius")} />}
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
      <Comments kind="element" id={el.id} />
    </>
  );
}

const ALIGN: { kind: AlignKind; label: string; icon: React.ReactElement }[] = [
  { kind: "left", label: "Align left", icon: <AlignLeft20Regular /> },
  { kind: "center", label: "Align center", icon: <AlignCenterVertical20Regular /> },
  { kind: "right", label: "Align right", icon: <AlignRight20Regular /> },
  { kind: "top", label: "Align top", icon: <AlignTop20Regular /> },
  { kind: "middle", label: "Align middle", icon: <AlignCenterHorizontal20Regular /> },
  { kind: "bottom", label: "Align bottom", icon: <AlignBottom20Regular /> },
];

function SelectionTools({ count }: { count: number }) {
  const styles = useStyles();
  return (
    <>
      <Text size={200} className={styles.muted}>
        {count} elements selected.
      </Text>
      <Text size={200} weight="semibold" className={styles.heading}>
        Align
      </Text>
      <div className={styles.actions}>
        {ALIGN.map((a) => (
          <Tooltip key={a.kind} content={a.label} relationship="label">
            <Button size="small" appearance="subtle" icon={a.icon} onClick={() => alignSelection(a.kind)} aria-label={a.label} />
          </Tooltip>
        ))}
        <Tooltip content="Distribute horizontally" relationship="label">
          <Button size="small" appearance="subtle" icon={<AlignSpaceEvenlyHorizontal20Regular />} disabled={count < 3} onClick={() => distributeSelection("horizontal")} aria-label="Distribute horizontally" />
        </Tooltip>
        <Tooltip content="Distribute vertically" relationship="label">
          <Button size="small" appearance="subtle" icon={<AlignSpaceEvenlyVertical20Regular />} disabled={count < 3} onClick={() => distributeSelection("vertical")} aria-label="Distribute vertically" />
        </Tooltip>
      </div>
      <Text size={200} weight="semibold" className={styles.heading}>
        Auto layout
      </Text>
      <div className={styles.actions}>
        {(["row", "column", "grid", "layered", "tree"] as const).map((k) => (
          <Button key={k} size="small" appearance="secondary" onClick={() => autoLayoutSelection(k)}>
            {k.charAt(0).toUpperCase() + k.slice(1)}
          </Button>
        ))}
      </div>
      <div className={styles.actions}>
        <Button size="small" icon={<Group20Regular />} onClick={groupSelection}>
          Group
        </Button>
        <Button size="small" appearance="subtle" icon={<Copy20Regular />} onClick={duplicateSelection}>
          Duplicate
        </Button>
        <Button size="small" appearance="subtle" icon={<Delete20Regular />} onClick={deleteSelection}>
          Delete
        </Button>
      </div>
    </>
  );
}

function GroupProperties({ el }: { el: Element }) {
  const styles = useStyles();
  const count = useEditor((s) => Object.values(s.scene.elements).filter((e) => e.parentId === el.id).length);
  return (
    <>
      <TextField label="ID" value={el.id} onCommit={(v) => renameElement(el.id, v)} />
      <Text size={200} className={styles.muted}>
        Group of {count} elements. An action on the group applies to each element. Alt+click selects one element.
      </Text>
      <div className={styles.actions}>
        <Button size="small" icon={<GroupDismiss20Regular />} onClick={ungroupSelection}>
          Ungroup
        </Button>
        <Button size="small" appearance="subtle" icon={<Copy20Regular />} onClick={duplicateSelection}>
          Duplicate
        </Button>
        <Button size="small" appearance="subtle" icon={<Delete20Regular />} onClick={deleteSelection}>
          Delete
        </Button>
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
          { value: "paper-light", text: "Paper light" },
          { value: "night-dark", text: "Night dark" },
          ...(settings.customTheme ? [{ value: settings.customTheme.name, text: `${settings.customTheme.name} (custom)` }] : []),
        ]}
        onCommit={(v) => commitSettings({ theme: v }, "Change theme")}
      />
      <Button size="small" appearance="subtle" onClick={() => useEditor.setState({ themeEditorOpen: true })}>
        Edit custom theme…
      </Button>
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
  const step = useEditor((s) => (s.selectedStep === null ? undefined : s.scene.steps.find((st) => st.id === s.selectedStep)));

  return (
    <aside className={styles.root} aria-label="Inspector">
      <Text weight="semibold" size={200} className={styles.muted}>
        {el ? "Element" : selection.length > 1 ? "Selection" : step ? "Step" : "Scene"}
      </Text>
      {el ? (
        el.type === "group" ? (
          <>
            <GroupProperties key={el.id} el={el} />
            {step && (
              <div>
                <AddActionMenu />
              </div>
            )}
          </>
        ) : (
          <ElementProperties key={el.id} el={el} />
        )
      ) : selection.length > 1 ? (
        <>
          <SelectionTools count={selection.length} />
          {step && (
            <div>
              <AddActionMenu />
            </div>
          )}
        </>
      ) : step ? (
        <StepInspector key={step.id} step={step} />
      ) : (
        <SceneProperties />
      )}
    </aside>
  );
}
