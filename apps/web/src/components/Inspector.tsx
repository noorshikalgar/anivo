/**
 * The properties editor (docs/15): vertical tabs (Scene, Step, Element) and
 * collapsible panels with property rows.
 */
import { KeyLabel } from "./KeyButton.js";
import { evaluate } from "@anivo/engine";
import type { Element } from "@anivo/schema";
import { Text, makeStyles, mergeClasses } from "@fluentui/react-components";
import {
  Add16Regular,
  AlignBottom16Regular,
  AlignCenterHorizontal16Regular,
  AlignCenterVertical16Regular,
  AlignLeft16Regular,
  AlignRight16Regular,
  AlignSpaceEvenlyHorizontal20Regular,
  AlignSpaceEvenlyVertical20Regular,
  AlignTop16Regular,
  ArrowDown16Regular,
  ArrowMaximizeVertical20Regular,
  ArrowMinimizeVertical20Regular,
  ArrowUp16Regular,
  Copy16Regular,
  Delete16Regular,
  Eye16Regular,
  EyeOff16Regular,
  Group20Regular,
  GroupDismiss20Regular,
  Info16Regular,
  LockClosed16Regular,
  LockOpen16Regular,
  Sparkle16Regular,
  TextNumberListLtr16Regular,
  Video16Regular,
  Warning16Regular,
} from "@fluentui/react-icons";
import { useEffect, useMemo } from "react";
import { type AlignKind, alignSelection, autoLayoutSelection, commitProps, commitSettings, deleteSelection, distributeSelection, duplicateSelection, groupSelection, renameElement, reorderSelection, setElementText, ungroupSelection, visibleAtStepStart } from "../commands.js";
import { useEditor } from "../store.js";
import { Comments } from "./Comments.js";
import { ColorField, NumberField, SelectField, TextField, useThemeColors, useThemeDefault } from "./fields.js";
import { ActionsPanel } from "./ActionsPanel.js";
import { AddActionMenu, StepInspector } from "./StepInspector.js";
import { elementIcon } from "./typeIcons.js";
import { Aligned, Btn, ColorPick, DragNumber, IconButton, Note, Panel, Prop } from "./ui.js";

const useStyles = makeStyles({
  root: {
    display: "grid",
    gridTemplateColumns: "28px minmax(0, 1fr)",
    minHeight: 0,
    backgroundColor: "var(--ui-region)",
    color: "var(--ui-text)",
    fontSize: "12px",
  },
  tabs: { display: "flex", flexDirection: "column", gap: "2px", padding: "4px 3px", backgroundColor: "var(--ui-header)" },
  body: { overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "4px", padding: "4px 6px 12px" },
  title: { display: "flex", alignItems: "center", gap: "6px", height: "24px", padding: "0 2px", color: "var(--ui-muted)", flexShrink: 0 },
  titleName: { color: "var(--ui-text)", fontWeight: 600 },
  headerRow: { display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 },
  headerIcon: { display: "flex", color: "var(--ui-muted)", padding: "0 4px" },
  grow: { flexGrow: 1, minWidth: 0 },
  icons: { display: "flex", gap: "1px", flexWrap: "wrap" },
  info: { display: "flex", gap: "6px", alignItems: "flex-start", padding: "4px 6px", borderRadius: "4px", backgroundColor: "var(--ui-panel)", fontSize: "11px", lineHeight: "15px", color: "var(--ui-muted)", flexShrink: 0 },
  warn: { color: "var(--ui-text)", backgroundColor: "rgba(255, 175, 41, 0.14)", boxShadow: "inset 2px 0 0 var(--ui-active)" },
  infoIcon: { display: "flex", paddingTop: "1px", flexShrink: 0 },
  infoBody: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" },
});

const SHAPES = new Set(["rectangle", "ellipse", "diamond", "line"]);
const MAIN = ["text", "transform", "shape", "type-specific", "text-style"];

function finalColor(c: unknown): string | undefined {
  if (c === undefined) return undefined;
  return typeof c === "string" ? c : (c as { to: string }).to;
}

/** A note in the properties: information, or a warning with an action. */
function Info({ warn, children, action }: { warn?: boolean; children: React.ReactNode; action?: React.ReactNode }) {
  const s = useStyles();
  return (
    <div className={mergeClasses(s.info, warn && s.warn)} role={warn ? "status" : undefined}>
      <span className={s.infoIcon}>{warn ? <Warning16Regular /> : <Info16Regular />}</span>
      <div className={s.infoBody}>
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}

function ElementProperties({ el }: { el: Element }) {
  const s = useStyles();
  const scene = useEditor((st) => st.scene);
  const playhead = useEditor((st) => st.playhead);
  const selectedStep = useEditor((st) => st.selectedStep);
  const autoKey = useEditor((st) => st.autoKey);
  // A keyframe button next to the property label, when the element can animate in the selected step.
  const key = (group: string, values: Record<string, unknown>, label: string) => (keyable ? <KeyLabel element={el.id} group={group} values={values}>{label}</KeyLabel> : label);
  const playing = useEditor((st) => st.playing);
  const stepTitle = useEditor((st) => st.scene.steps.find((x) => x.id === st.selectedStep)?.title);
  const colors = useThemeColors(scene.settings.theme);
  const defFill = useThemeDefault(scene.settings.theme, "fill");
  const defStroke = useThemeDefault(scene.settings.theme, "stroke");
  const defText = useThemeDefault(scene.settings.theme, "textColor");
  // Show the values at the current time, so morphs in a step show their result.
  const f = useMemo(() => {
    const t = !playing && selectedStep === null && playhead === 0 ? -1 : playhead;
    return evaluate(scene, t).elements.find((e) => e.id === el.id);
  }, [scene, playhead, selectedStep, playing, el.id]);
  const timeline = useEditor((st) => st.timeline);
  // Base edits: morphs of earlier steps can set the same properties at the playhead, so the change does not show here.
  const overrides = useMemo(() => {
    if (selectedStep !== null || playing || playhead <= 0) return [];
    // The last morph of each property wins.
    const last = new Map<string, string>();
    for (const st of timeline.steps) for (const ta of st.actions) if (ta.action.type === "morph" && ta.target === el.id && ta.startMs <= playhead) for (const k of Object.keys(ta.action.to)) last.set(k, st.id);
    const out: { stepId: string; title: string; keys: string[] }[] = [];
    for (const [k, stepId] of last) {
      const o = out.find((x) => x.stepId === stepId);
      if (o) o.keys.push(k);
      else out.push({ stepId, title: scene.steps.find((x) => x.id === stepId)?.title ?? stepId, keys: [k] });
    }
    return out;
  }, [timeline, scene.steps, selectedStep, playing, playhead, el.id]);
  if (!f) return null;
  const keyable = selectedStep !== null && visibleAtStepStart()(el.id);
  const theme = scene.settings.theme;
  const set = (changes: Record<string, unknown>, label?: string, mergeKey?: string) => commitProps(el.id, changes, label, mergeKey);
  // The text at the playhead: in a step, a morph can change it.
  const text = f.label ?? "";
  const hasText = el.type !== "connector" && el.type !== "code" && el.type !== "image" && el.type !== "table";
  const shapeLike = SHAPES.has(el.type) || el.type === "connector" || el.type === "icon" || el.type === "image";

  return (
    <>
      <div className={s.headerRow}>
        <span className={s.headerIcon} title={el.type}>
          {elementIcon(el.type)}
        </span>
        <div className={s.grow}>
          <TextField label="ID" hideLabel value={el.id} onCommit={(v) => renameElement(el.id, v)} />
        </div>
        <IconButton label={el.editorHidden ? "Show in the editor" : "Hide in the editor (the video still shows it)"} pressed={!el.editorHidden} icon={<Eye16Regular />} offIcon={<EyeOff16Regular />} onClick={() => set({ editorHidden: !el.editorHidden }, el.editorHidden ? "Show in editor" : "Hide in editor")} />
        <IconButton label={el.locked ? "Unlock" : "Lock"} pressed={el.locked} icon={<LockClosed16Regular />} offIcon={<LockOpen16Regular />} onClick={() => set({ locked: !el.locked }, el.locked ? "Unlock" : "Lock")} />
      </div>

      {overrides.length > 0 && (
        <Info
          warn
          action={
            <Btn onClick={() => useEditor.getState().selectStep(overrides.at(-1)!.stepId)}>
              Go to step "{overrides.at(-1)!.title}"
            </Btn>
          }
        >
          At this time, {overrides.map((o) => `step "${o.title}" sets ${o.keys.join(", ")}`).join("; ")}. Your change to {overrides.length > 1 || overrides[0]!.keys.length > 1 ? "these properties" : "it"} changes the element before that step only.
        </Info>
      )}
      {selectedStep !== null && (
        <Info action={<AddActionMenu />}>
          {autoKey
            ? `Auto-key is on: changes to position, size, color, and label make a keyframe at the playhead in step "${stepTitle}". Press K to turn it off.`
            : `Changes to position, size, color, and label animate in step "${stepTitle}" (a morph). To make keyframes at the playhead, press K (auto-key). To change the element in all steps, select Base in the step list.`}
        </Info>
      )}

      {hasText && (
        <Panel id="el-text" title={el.type === "text" ? "Text" : "Label"} group={MAIN}>
          <TextField
            label={el.type === "text" ? "Text" : "Label"}
            multiline
            value={text}
            placeholder="No label"
            onCommit={(v) => (el.type === "text" && selectedStep === null ? setElementText(el.id, v) : set({ label: v }, el.type === "text" ? "Edit text" : "Edit label"))}
          />
        </Panel>
      )}

      {el.type !== "connector" && (
        <Panel id="el-transform" title="Transform" group={MAIN}>
          <Prop label={key("position", { x: f.x, y: f.y }, "Position")}>
            <Aligned>
              <DragNumber label="X" inner value={f.x} onCommit={(v, k) => set({ x: v }, "Move element", k)} />
              <DragNumber label="Y" inner value={f.y} onCommit={(v, k) => set({ y: v }, "Move element", k)} />
            </Aligned>
          </Prop>
          <Prop label={key("size", { width: f.width, height: f.height }, "Size")}>
            <Aligned>
              <DragNumber label="Width" inner value={f.width} min={8} onCommit={(v, k) => set({ width: v }, "Resize element", k)} />
              <DragNumber label="Height" inner value={f.height} min={8} onCommit={(v, k) => set({ height: v }, "Resize element", k)} />
            </Aligned>
          </Prop>
          <Prop label={key("opacity", { opacity: f.opacity }, "Opacity")}>
            <DragNumber label="Opacity" value={Math.round(f.opacity * 100)} min={0} max={100} unit="%" onCommit={(v, k) => set({ opacity: v / 100 }, "Change opacity", k)} />
          </Prop>
        </Panel>
      )}

      {shapeLike && (
        <Panel id="el-shape" title={el.type === "connector" ? "Arrow" : "Appearance"} group={MAIN}>
          {SHAPES.has(el.type) && el.type !== "line" && (
            <Prop label={key("fill", { fill: finalColor(f.fill) }, "Fill")}>
              <ColorPick label="Fill" value={finalColor(f.fill)} colors={colors} defaultCss={defFill} onCommit={(v) => set({ fill: v }, "Change fill")} />
            </Prop>
          )}
          {el.type === "icon" && (
            <Prop label="Badge">
              <ColorPick label="Badge" value={el.style.fill} colors={colors} onCommit={(v) => set({ fill: v }, "Change badge")} />
            </Prop>
          )}
          {(SHAPES.has(el.type) || el.type === "icon") && el.type !== "line" && (
            <>
              {el.type !== "icon" && (
                <Prop label="Gradient">
                  <ColorPick label="Gradient" value={el.style.gradient} colors={colors} onCommit={(v) => set({ gradient: v }, "Change gradient")} />
                </Prop>
              )}
              <SelectField
                label="Shadow"
                value={(el.style.shadow ?? "theme") as "theme"}
                options={[
                  { value: "theme", text: "Theme default" },
                  { value: "none", text: "None" },
                  { value: "soft", text: "Soft" },
                  { value: "hard", text: "Hard (pop)" },
                  { value: "glow", text: "Glow" },
                ]}
                onCommit={(v) => set({ shadow: v === "theme" ? null : v }, "Change shadow")}
              />
              {el.style.shadow !== undefined && el.style.shadow !== "none" && (
                <Prop label="Shadow color">
                  <ColorPick label="Shadow color" value={el.style.shadowColor} colors={colors} onCommit={(v) => set({ shadowColor: v }, "Change shadow color")} />
                </Prop>
              )}
            </>
          )}
          {el.type !== "image" && (
            <Prop label={key("stroke", { stroke: finalColor(f.stroke) }, el.type === "icon" ? "Color" : "Stroke")}>
              <ColorPick label={el.type === "icon" ? "Icon color" : "Stroke"} value={finalColor(f.stroke)} colors={colors} defaultCss={el.type === "icon" ? defText : defStroke} onCommit={(v) => set({ stroke: v }, "Change stroke")} />
            </Prop>
          )}
          {(SHAPES.has(el.type) || el.type === "connector") && (
            <>
              <NumberField label="Stroke width" value={f.strokeWidth ?? 2} min={0} max={40} onCommit={(v, k) => set({ strokeWidth: v }, "Change stroke width", k)} />
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
            </>
          )}
          {(el.type === "rectangle" || el.type === "image") && <NumberField label="Corner radius" value={f.cornerRadius ?? (el.type === "image" ? 0 : 12)} min={0} max={200} onCommit={(v, k) => set({ cornerRadius: v }, "Change corner radius", k)} />}
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
            </>
          )}
        </Panel>
      )}

      {el.type === "code" && (
        <Panel id="el-code" title="Code" group={MAIN}>
          <TextField label="Code" multiline value={el.code} onCommit={(v) => void useEditor.getState().apply({ label: "Edit code", ops: [{ op: "element.update", id: el.id, set: { code: v } }] })} />
          <SelectField
            label="Language"
            value={el.language as "ts"}
            options={["ts", "js", "py", "go", "rust", "java", "sql", "bash", "yaml", "json"].map((l) => ({ value: l as "ts", text: l }))}
            onCommit={(v) => set({ language: v }, "Change language")}
          />
        </Panel>
      )}
      {el.type === "table" && (
        <Panel id="el-table" title="Table" group={MAIN}>
          <NumberField label="Rows" value={el.rows} min={1} max={50} onCommit={(v) => set({ rows: Math.round(v) }, "Change rows")} />
          <NumberField label="Columns" value={el.cols} min={1} max={20} onCommit={(v) => set({ cols: Math.round(v) }, "Change columns")} />
          <SelectField
            label="Header row"
            value={el.header ? "on" : "off"}
            options={[
              { value: "on", text: "Row 1 is a header" },
              { value: "off", text: "No header" },
            ]}
            onCommit={(v) => set({ header: v === "on" }, "Change header")}
          />
        </Panel>
      )}

      {(el.label || el.type === "text") && (
        <Panel id="el-text-style" title="Text style" group={MAIN}>
          <NumberField label="Font size" value={f.fontSize ?? 32} min={8} max={400} onCommit={(v, k) => set({ fontSize: v }, "Change font size", k)} />
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
          <ColorField label="Text color" role="textColor" theme={theme} value={finalColor(f.textColor)} onCommit={(v) => set({ textColor: v }, "Change text color")} />
        </Panel>
      )}

      <Panel id="el-arrange" title="Arrange" defaultOpen={false}>
        <Prop label="Order">
          <div className={s.icons}>
            <IconButton label="Bring to front" icon={<ArrowMaximizeVertical20Regular />} onClick={() => reorderSelection("front")} />
            <IconButton label="Bring forward" icon={<ArrowUp16Regular />} onClick={() => reorderSelection("forward")} />
            <IconButton label="Send backward" icon={<ArrowDown16Regular />} onClick={() => reorderSelection("backward")} />
            <IconButton label="Send to back" icon={<ArrowMinimizeVertical20Regular />} onClick={() => reorderSelection("back")} />
          </div>
        </Prop>
        <Prop label="Element">
          <div className={s.icons}>
            <IconButton label="Duplicate (Ctrl+D)" icon={<Copy16Regular />} onClick={duplicateSelection} />
            <IconButton label="Delete (Delete)" icon={<Delete16Regular />} onClick={deleteSelection} />
          </div>
        </Prop>
        <Prop label="">
          <Btn onClick={() => useEditor.setState({ saveWidgetOpen: true })}>Save as widget…</Btn>
        </Prop>
      </Panel>
      <Panel id="el-comments" title="Comments" defaultOpen={false}>
        <Comments kind="element" id={el.id} />
      </Panel>
    </>
  );
}

const ALIGN: { kind: AlignKind; label: string; icon: React.ReactElement }[] = [
  { kind: "left", label: "Align left", icon: <AlignLeft16Regular /> },
  { kind: "center", label: "Align center", icon: <AlignCenterVertical16Regular /> },
  { kind: "right", label: "Align right", icon: <AlignRight16Regular /> },
  { kind: "top", label: "Align top", icon: <AlignTop16Regular /> },
  { kind: "middle", label: "Align middle", icon: <AlignCenterHorizontal16Regular /> },
  { kind: "bottom", label: "Align bottom", icon: <AlignBottom16Regular /> },
];

function SelectionTools({ count }: { count: number }) {
  const s = useStyles();
  const step = useEditor((st) => st.selectedStep);
  return (
    <>
      <Note>{count} elements selected.</Note>
      {step !== null && <Info action={<AddActionMenu />}>Add an action for the selected elements to this step.</Info>}
      <Panel id="sel-align" title="Align">
        <Prop label="Align">
          <div className={s.icons}>
            {ALIGN.map((a) => (
              <IconButton key={a.kind} label={a.label} icon={a.icon} onClick={() => alignSelection(a.kind)} />
            ))}
          </div>
        </Prop>
        <Prop label="Distribute">
          <div className={s.icons}>
            <IconButton label="Distribute horizontally" icon={<AlignSpaceEvenlyHorizontal20Regular />} disabled={count < 3} onClick={() => distributeSelection("horizontal")} />
            <IconButton label="Distribute vertically" icon={<AlignSpaceEvenlyVertical20Regular />} disabled={count < 3} onClick={() => distributeSelection("vertical")} />
          </div>
        </Prop>
      </Panel>
      <Panel id="sel-layout" title="Auto layout">
        <Prop label="Layout">
          <div className={s.icons} style={{ gap: "2px" }}>
            {(["row", "column", "grid", "layered", "tree"] as const).map((k) => (
              <Btn key={k} onClick={() => autoLayoutSelection(k)}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </Btn>
            ))}
          </div>
        </Prop>
      </Panel>
      <Panel id="sel-edit" title="Selection">
        <Prop label="Elements">
          <div className={s.icons}>
            <IconButton label="Group (Ctrl+G)" icon={<Group20Regular />} onClick={groupSelection} />
            <IconButton label="Duplicate (Ctrl+D)" icon={<Copy16Regular />} onClick={duplicateSelection} />
            <IconButton label="Delete (Delete)" icon={<Delete16Regular />} onClick={deleteSelection} />
          </div>
        </Prop>
        <Prop label="">
          <Btn onClick={() => useEditor.setState({ saveWidgetOpen: true })}>Save as widget…</Btn>
        </Prop>
      </Panel>
    </>
  );
}

function GroupProperties({ el }: { el: Element }) {
  const s = useStyles();
  const count = useEditor((st) => Object.values(st.scene.elements).filter((e) => e.parentId === el.id).length);
  const step = useEditor((st) => st.selectedStep);
  return (
    <>
      <div className={s.headerRow}>
        <span className={s.headerIcon}>{elementIcon("group")}</span>
        <div className={s.grow}>
          <TextField label="ID" hideLabel value={el.id} onCommit={(v) => renameElement(el.id, v)} />
        </div>
      </div>
      <Note>Group of {count} elements. An action on the group applies to each element. Alt+click selects one element.</Note>
      {step !== null && <Info action={<AddActionMenu />}>Add an action for the group to this step.</Info>}
      <Panel id="group-edit" title="Group">
        <Prop label="Group">
          <div className={s.icons}>
            <IconButton label="Ungroup (Ctrl+Shift+G)" icon={<GroupDismiss20Regular />} onClick={ungroupSelection} />
            <IconButton label="Duplicate (Ctrl+D)" icon={<Copy16Regular />} onClick={duplicateSelection} />
            <IconButton label="Delete (Delete)" icon={<Delete16Regular />} onClick={deleteSelection} />
          </div>
        </Prop>
        <Prop label="">
          <Btn onClick={() => useEditor.setState({ saveWidgetOpen: true })}>Save as widget…</Btn>
        </Prop>
      </Panel>
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
  const meta = useEditor((st) => st.scene.meta);
  const settings = useEditor((st) => st.scene.settings);
  const size = `${settings.video.width}x${settings.video.height}`;
  return (
    <>
      <Panel id="scene-scene" title="Scene">
        <TextField label="Title" value={meta.title} onCommit={(v) => void useEditor.getState().apply({ label: "Rename scene", ops: [{ op: "scene.meta", set: { title: v } }] })} />
      </Panel>
      <Panel id="scene-look" title="Look">
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
            { value: "pop-light", text: "Pop (bold, hard shadows)" },
            { value: "neon-dark", text: "Neon (glow)" },
            ...(settings.customTheme ? [{ value: settings.customTheme.name, text: `${settings.customTheme.name} (custom)` }] : []),
          ]}
          onCommit={(v) => commitSettings({ theme: v }, "Change theme")}
        />
        <Prop label="">
          <Btn onClick={() => useEditor.setState({ themeEditorOpen: true })}>Edit custom theme…</Btn>
        </Prop>
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
      </Panel>
      <Panel id="scene-video" title="Video">
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
      </Panel>
    </>
  );
}

type Tab = "scene" | "step" | "actions" | "element";

export function Inspector() {
  const s = useStyles();
  const selection = useEditor((st) => st.selection);
  const elements = useEditor((st) => st.scene.elements);
  const el = selection.length === 1 ? elements[selection[0]!] : undefined;
  const step = useEditor((st) => (st.selectedStep === null ? undefined : st.scene.steps.find((x) => x.id === st.selectedStep)));
  const hasSteps = useEditor((st) => st.scene.steps.length > 0);
  const tab = useEditor((st) => st.propTab);
  const setTab = (t: Tab) => useEditor.setState({ propTab: t });
  // A new selection shows the element; a new step shows its actions.
  useEffect(() => {
    if (selection.length > 0) setTab("element");
  }, [selection]);
  useEffect(() => {
    if (step && useEditor.getState().selection.length === 0) setTab("actions");
    else if (!step && (tab === "step" || tab === "actions") && useEditor.getState().selection.length === 0) setTab("scene");
  }, [step?.id]);
  const shown: Tab = tab === "element" && selection.length === 0 ? (step ? "actions" : "scene") : tab === "step" && !step ? "scene" : tab === "actions" && !hasSteps ? "scene" : tab;
  const name = shown === "element" ? "Element" : shown === "step" ? "Step" : shown === "actions" ? "Actions" : "Scene";

  return (
    <aside className={s.root} aria-label="Inspector">
      <nav className={s.tabs} aria-label="Properties tabs">
        <IconButton tool label="Scene" pressed={shown === "scene"} icon={<Video16Regular />} onClick={() => setTab("scene")} />
        {step && <IconButton tool label="Step" pressed={shown === "step"} icon={<TextNumberListLtr16Regular />} onClick={() => setTab("step")} />}
        {hasSteps && <IconButton tool label="Actions" pressed={shown === "actions"} icon={<Sparkle16Regular />} onClick={() => setTab("actions")} />}
        {selection.length > 0 && <IconButton tool label="Element" pressed={shown === "element"} icon={el ? elementIcon(el.type) : <Add16Regular />} onClick={() => setTab("element")} />}
      </nav>
      <div className={s.body}>
        <div className={s.title}>
          <Text size={200}>{name}</Text>
          {shown === "element" && el && <span className={s.titleName}>{el.id}</span>}
          {(shown === "step" || shown === "actions") && step && <span className={s.titleName}>{step.title}</span>}
        </div>
        {shown === "element" ? (
          el ? (
            el.type === "group" ? <GroupProperties key={el.id} el={el} /> : <ElementProperties key={el.id} el={el} />
          ) : (
            <SelectionTools count={selection.length} />
          )
        ) : shown === "actions" ? (
          <ActionsPanel />
        ) : shown === "step" && step ? (
          <StepInspector key={step.id} step={step} />
        ) : (
          <SceneProperties />
        )}
      </div>
    </aside>
  );
}
