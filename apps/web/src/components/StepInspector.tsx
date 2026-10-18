import { defaultDurationMs } from "@anivo/schema";
import { SOUNDS } from "@anivo/engine";
import type { Action, Step } from "@anivo/schema";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Combobox,
  Field,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Switch,
  Tag,
  TagPicker,
  TagPickerControl,
  TagPickerGroup,
  TagPickerInput,
  TagPickerList,
  TagPickerOption,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Add20Regular, Delete20Regular, SplitVertical20Regular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { searchIcons } from "@anivo/render";
import { pickImageAsset } from "../images.js";
import { withErrors } from "../notify.js";
import { addAction, addMotionAlongArrow, canSplitAction, removeAction, splitAction, updateAction, updateStep } from "../commands.js";
import { setCue, setStepLine } from "../audio.js";
import { Comments } from "./Comments.js";
import { useEditor } from "../store.js";
import { ColorField, NumberField, Row, SelectField, TextField } from "./fields.js";

const useStyles = makeStyles({
  heading: { color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXS },
  muted: { color: tokens.colorNeutralForeground3 },
  panel: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  targets: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

const ENTER_EFFECTS = ["fade", "pop", "scale", "slide", "draw-on", "wipe", "typewriter"] as const;
const EMPHASIS_EFFECTS = ["pulse", "shake", "wiggle", "glow", "flash", "highlight", "focus"] as const;
const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out", "back-out", "spring-soft", "spring-bouncy"] as const;
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

export function describe(a: Action): string {
  if (a.type === "enter" || a.type === "exit" || a.type === "emphasis") return `${label(a.type)} · ${a.effect}`;
  if (a.type === "morph") return `Morph · ${Object.keys(a.to).join(", ")}`;
  if (a.type === "camera") return `Camera · ${a.camera.op}`;
  if (a.type === "counter") return `Count · ${a.counter.from} to ${a.counter.to}`;
  if (a.type === "motion") return `Move along a path · ${a.motion.points.length} points`;
  if (a.type === "code") return `Code · ${a.code.op}${a.code.lines ? ` ${a.code.lines[0]}-${a.code.lines[1]}` : ""}`;
  return label(a.type);
}

/** Menu that adds an action for the selected elements to the selected step. */
export function AddActionMenu({ appearance = "secondary" }: { appearance?: "secondary" | "subtle" }) {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => s.scene.elements);
  const connectors = selection.filter((id) => elements[id]?.type === "connector");
  const texts = selection.filter((id) => elements[id]?.type === "text");
  const codes = selection.filter((id) => elements[id]?.type === "code");
  const none = selection.length === 0;
  const add = (action: Record<string, unknown>, name: string) => addAction({ targets: selection, ...action }, name);
  const step = useEditor((s) => s.selectedStep);
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button size="small" appearance={appearance} icon={<Add20Regular />} disabled={none && step === null}>
          Add action
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem onClick={() => addAction({ type: "camera", camera: { op: "reset" } }, "Add camera reset")}>Camera: reset to the full view</MenuItem>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuItem disabled={none}>Enter</MenuItem>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {ENTER_EFFECTS.map((e) => (
                  <MenuItem key={e} onClick={() => add({ type: "enter", effect: e }, "Add enter")}>
                    {label(e)}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuItem disabled={none}>Exit</MenuItem>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {ENTER_EFFECTS.map((e) => (
                  <MenuItem key={e} onClick={() => add({ type: "exit", effect: e }, "Add exit")}>
                    {label(e)}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuItem disabled={none}>Emphasis</MenuItem>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {EMPHASIS_EFFECTS.map((e) => (
                  <MenuItem key={e} onClick={() => add({ type: "emphasis", effect: e }, "Add emphasis")}>
                    {label(e)}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <MenuItem disabled={connectors.length === 0} onClick={() => addAction({ type: "flow", targets: connectors, flow: connectors.length > 1 ? { distribute: "round-robin" } : {} }, "Add flow")}>
            Flow {connectors.length === 0 ? "(select an arrow)" : ""}
          </MenuItem>
          <MenuItem disabled={none} onClick={() => addAction({ type: "camera", targets: selection, camera: { op: "zoom-to" } }, "Add camera zoom")}>
            Camera: zoom to selection
          </MenuItem>
          <MenuItem disabled={connectors.length !== 1 || selection.length < 2 || step === null} onClick={addMotionAlongArrow}>
            Move along the selected arrow
          </MenuItem>
          <MenuItem disabled={codes.length === 0} onClick={() => addAction({ type: "code", targets: codes, code: { op: "highlight", lines: [1, 1] } }, "Add code highlight")}>
            Code: highlight lines {codes.length === 0 ? "(select a code block)" : ""}
          </MenuItem>
          <MenuItem disabled={codes.length === 0} onClick={() => addAction({ type: "code", targets: codes, code: { op: "type", lines: [1, 1] } }, "Add code typing")}>
            Code: type lines
          </MenuItem>
          <MenuItem disabled={codes.length !== 1} onClick={() => addAction({ type: "code", targets: codes, code: { op: "diff", newCode: (elements[codes[0]!] as { code?: string } | undefined)?.code ?? "" } }, "Add code change")}>
            Code: change the code
          </MenuItem>
          <MenuItem disabled={texts.length === 0} onClick={() => addAction({ type: "counter", targets: texts, counter: { from: 0, to: 100 } }, "Add count")}>
            Count {texts.length === 0 ? "(select a text)" : ""}
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

type FlowAction = Extract<Action, { type: "flow" }>;

/** Icon name field with search (pack:name). */
function IconField({ value, onCommit }: { value: string | undefined; onCommit: (v: string) => void }) {
  const [query, setQuery] = useState(value ?? "");
  useEffect(() => setQuery(value ?? ""), [value]);
  const results = useMemo(() => searchIcons(query.includes(":") ? query.split(":")[1]! : query, { limit: 20 }), [query]);
  return (
    <Field label="Icon" size="small" hint={value ? undefined : "Type to search, for example mail or packet."}>
      <Combobox
        size="small"
        freeform
        value={query}
        selectedOptions={value ? [value] : []}
        onChange={(e) => setQuery(e.target.value)}
        onOptionSelect={(_, d) => d.optionValue && onCommit(d.optionValue)}
        aria-label="Particle icon"
      >
        {results.map((r) => (
          <Option key={`${r.pack}:${r.name}`} value={`${r.pack}:${r.name}`}>
            {`${r.pack}:${r.name}`}
          </Option>
        ))}
      </Combobox>
    </Field>
  );
}

/** What moves along the arrows of a flow (FR-STEP-07): shape, icon, image, size, color, amount, trail, and turn. */
function FlowParticle({ step, action, theme }: { step: Step; action: FlowAction; theme: string }) {
  const f = action.flow;
  const assets = useEditor((s) => s.scene.assets);
  const images = useMemo(() => Object.entries(assets).filter(([, a]) => a.mime.startsWith("image/")), [assets]);
  const set = (next: Partial<FlowAction["flow"]>, label = "Change flow particle") => {
    const flow: Record<string, unknown> = { ...f, ...next };
    for (const k of Object.keys(flow)) if (flow[k] === undefined) delete flow[k];
    updateAction(step.id, action.id, { flow }, label);
  };
  const amount = f.count === undefined ? "stream" : f.count === 1 ? "once" : "count";
  return (
    <>
      <Row>
        <SelectField
          label="Particle"
          value={f.shape}
          options={[
            { value: "dot", text: "Dot" },
            { value: "square", text: "Square" },
            { value: "pill", text: "Pill" },
            { value: "icon", text: "Icon" },
            { value: "image", text: "Image or SVG" },
          ]}
          onCommit={(v) => set({ shape: v, ...(v === "icon" && !f.icon ? { icon: "lucide:mail" } : {}), ...((v === "icon" || v === "image") && f.size < 16 ? { size: 32 } : {}) })}
        />
        <NumberField label="Size (px)" value={f.size} min={2} max={400} step={2} onCommit={(v) => set({ size: v })} />
      </Row>
      {f.shape === "icon" && <IconField value={f.icon} onCommit={(v) => set({ icon: v })} />}
      {f.shape === "image" && (
        <Row>
          <SelectField label="Image" value={f.assetId ?? "none"} options={[{ value: "none", text: "None" }, ...images.map(([id, a]) => ({ value: id, text: a.name ?? id }))]} onCommit={(v) => set({ assetId: v === "none" ? undefined : v })} />
          <Field label=" " size="small">
            <Button
              size="small"
              onClick={() =>
                void withErrors(async () => {
                  const r = await pickImageAsset();
                  if (!r) return;
                  useEditor.getState().apply({ label: "Change flow image", ops: [...r.ops, { op: "action.update", step: step.id, id: action.id, set: { flow: { ...f, shape: "image", assetId: r.id } } }] });
                })
              }
            >
              Choose file…
            </Button>
          </Field>
        </Row>
      )}
      {f.shape !== "image" && <ColorField label="Particle color" theme={theme} value={f.color} onCommit={(v) => set({ color: v ?? "accent" })} />}
      <Row>
        <SelectField
          label="Particles"
          value={amount}
          options={[
            { value: "stream", text: "A stream" },
            { value: "once", text: "One particle" },
            { value: "count", text: "A number" },
          ]}
          onCommit={(v) => set({ count: v === "stream" ? undefined : v === "once" ? 1 : Math.max(2, f.count ?? 3) })}
        />
        {amount === "count" ? <NumberField label="Number" value={f.count ?? 3} min={2} max={100} onCommit={(v) => set({ count: Math.max(1, Math.round(v)) })} /> : <div />}
      </Row>
      <Row>
        <NumberField label="Trail (0–1)" value={f.trail} min={0} max={1} step={0.1} onCommit={(v) => set({ trail: Math.max(0, Math.min(1, v)) })} />
        <Field label="Turn along the arrow" size="small">
          <Switch checked={f.orient} onChange={(_, d) => set({ orient: d.checked })} aria-label="Turn along the arrow" />
        </Field>
      </Row>
    </>
  );
}

function ActionEditor({ step, action }: { step: Step; action: Action }) {
  const styles = useStyles();
  const theme = useEditor((s) => s.scene.settings.theme);
  const elements = useEditor((s) => s.scene.elements);
  // Derive the list outside the store selector: a new array from a selector re-renders without end.
  const connectorIds = useMemo(() => Object.values(elements).filter((e) => e.type === "connector").map((e) => e.id), [elements]);
  const set = (s: Record<string, unknown>, name?: string) => updateAction(step.id, action.id, s, name);
  const duration = action.durationMs ?? defaultDurationMs(action);
  return (
    <div className={styles.panel}>
      {(action.type === "enter" || action.type === "exit") && (
        <SelectField label="Effect" value={action.effect} options={ENTER_EFFECTS.map((e) => ({ value: e, text: label(e) }))} onCommit={(v) => set({ effect: v }, "Change effect")} />
      )}
      {action.type === "emphasis" && <SelectField label="Effect" value={action.effect} options={EMPHASIS_EFFECTS.map((e) => ({ value: e, text: label(e) }))} onCommit={(v) => set({ effect: v }, "Change effect")} />}
      {(action.type === "enter" || action.type === "exit") && (action.effect === "slide" || action.effect === "wipe") && (
        <Row>
          <SelectField
            label="Direction"
            value={action.params.direction ?? (action.effect === "slide" ? "up" : "right")}
            options={[
              { value: "up", text: "Up" },
              { value: "down", text: "Down" },
              { value: "left", text: "Left" },
              { value: "right", text: "Right" },
            ]}
            onCommit={(v) => set({ params: { ...action.params, direction: v } }, "Change direction")}
          />
          {action.effect === "slide" ? <NumberField label="Distance (px)" value={action.params.distance ?? 80} min={0} step={10} onCommit={(v) => set({ params: { ...action.params, distance: v } }, "Change distance")} /> : <div />}
        </Row>
      )}
      {(action.type === "enter" || action.type === "exit") && (action.effect === "pop" || action.effect === "scale") && (
        <NumberField label="Start scale" value={action.params.fromScale ?? (action.effect === "pop" ? 0.6 : 0)} min={0} max={2} step={0.1} onCommit={(v) => set({ params: { ...action.params, fromScale: v } }, "Change scale")} />
      )}
      {action.type === "emphasis" && ["pulse", "shake", "wiggle"].includes(action.effect) && (
        <NumberField label="Count" value={action.params.count ?? (action.effect === "pulse" ? 2 : action.effect === "shake" ? 4 : 3)} min={1} max={20} onCommit={(v) => set({ params: { ...action.params, count: Math.round(v) } }, "Change count")} />
      )}
      {action.type === "emphasis" && ["glow", "flash", "highlight"].includes(action.effect) && (
        <ColorField label="Color" theme={theme} value={action.params.color} onCommit={(v) => set({ params: { ...action.params, color: v ?? undefined } }, "Change color")} />
      )}
      <Row>
        <NumberField label="Delay (ms)" value={action.delayMs} min={0} step={50} onCommit={(v) => set({ delayMs: Math.round(v) }, "Change delay")} />
        <NumberField label="Duration (ms)" value={duration} min={0} step={50} onCommit={(v) => set({ durationMs: Math.round(v) }, "Change duration")} />
      </Row>
      <Row>
        <SelectField
          label="Easing"
          value={typeof action.easing === "string" ? action.easing : "default"}
          options={[{ value: "default", text: "Default" }, ...EASINGS.map((e) => ({ value: e, text: label(e) }))]}
          onCommit={(v) => set({ easing: v === "default" ? null : v }, "Change easing")}
        />
        {action.targets.length > 1 ? <NumberField label="Stagger (ms)" value={action.staggerMs} min={0} step={20} onCommit={(v) => set({ staggerMs: Math.round(v) }, "Change stagger")} /> : <div />}
      </Row>
      <SelectField
        label="Sound"
        value={action.sound ?? "none"}
        options={[{ value: "none", text: "No sound" }, ...SOUNDS.map((x) => ({ value: x, text: label(x) }))]}
        onCommit={(v) => set({ sound: v === "none" ? null : v }, "Change sound")}
      />
      {action.type === "motion" && (
        <Row>
          <SelectField label="Path" value={action.motion.curve ? "curve" : "lines"} options={[{ value: "lines", text: "Straight lines" }, { value: "curve", text: "Smooth curve" }]} onCommit={(v) => set({ motion: { ...action.motion, curve: v === "curve" } }, "Change path")} />
          <SelectField label="Turn" value={action.motion.orient ? "yes" : "no"} options={[{ value: "no", text: "Keep angle" }, { value: "yes", text: "Turn along path" }]} onCommit={(v) => set({ motion: { ...action.motion, orient: v === "yes" } }, "Change turn")} />
        </Row>
      )}
      {action.type === "camera" && action.camera.op === "zoom-to" && (
        <NumberField label="Padding (px)" value={action.camera.padding} min={0} step={20} onCommit={(v) => set({ camera: { ...action.camera, padding: v } }, "Change camera padding")} />
      )}
      {action.type === "counter" && (
        <>
          <Row>
            <NumberField label="From" value={action.counter.from} onCommit={(v) => set({ counter: { ...action.counter, from: v } }, "Change count")} />
            <NumberField label="To" value={action.counter.to} onCommit={(v) => set({ counter: { ...action.counter, to: v } }, "Change count")} />
          </Row>
          <Row>
            <TextField label="Format" value={action.counter.format} placeholder="{n} req/s" onCommit={(v) => void set({ counter: { ...action.counter, format: v.includes("{n}") ? v : `{n} ${v}`.trim() } }, "Change count format")} />
            <NumberField label="Decimals" value={action.counter.decimals} min={0} max={6} onCommit={(v) => set({ counter: { ...action.counter, decimals: Math.round(v) } }, "Change count decimals")} />
          </Row>
        </>
      )}
      {action.type === "code" && action.code.op !== "diff" && (
        <Row>
          <NumberField label="First line" value={action.code.lines?.[0] ?? 1} min={1} onCommit={(v) => set({ code: { ...action.code, lines: [Math.round(v), Math.max(Math.round(v), action.code.lines?.[1] ?? 1)] } }, "Change lines")} />
          <NumberField label="Last line" value={action.code.lines?.[1] ?? 1} min={1} onCommit={(v) => set({ code: { ...action.code, lines: [Math.min(action.code.lines?.[0] ?? 1, Math.round(v)), Math.round(v)] } }, "Change lines")} />
        </Row>
      )}
      {action.type === "code" && action.code.op === "diff" && (
        <TextField label="New code" multiline value={action.code.newCode ?? ""} onCommit={(v) => void set({ code: { ...action.code, newCode: v } }, "Change new code")} />
      )}
      {action.type === "flow" && (
        <>
          <FlowParticle step={step} action={action} theme={theme} />
          <Row>
            <NumberField label="Rate (per s)" value={action.flow.rate} min={0.1} step={0.5} onCommit={(v) => set({ flow: { ...action.flow, rate: v } }, "Change flow")} />
            <NumberField label="Speed (px/s)" value={action.flow.speed} min={10} step={50} onCommit={(v) => set({ flow: { ...action.flow, speed: v } }, "Change flow")} />
          </Row>
          <Row>
            <SelectField
              label="Distribute"
              value={action.flow.distribute}
              options={[
                { value: "all", text: "All arrows" },
                { value: "round-robin", text: "Round-robin" },
                { value: "random-seeded", text: "Random" },
              ]}
              onCommit={(v) => set({ flow: { ...action.flow, distribute: v } }, "Change flow")}
            />
            <SelectField
              label="Direction"
              value={action.flow.direction}
              options={[
                { value: "forward", text: "Forward" },
                { value: "reverse", text: "Reverse" },
                { value: "both", text: "Both" },
              ]}
              onCommit={(v) => set({ flow: { ...action.flow, direction: v } }, "Change flow")}
            />
          </Row>
          <Field label="Skip arrows" size="small" hint="Particles do not use these arrows, for example a failed connection.">
            <TagPicker
              size="medium"
              selectedOptions={action.flow.skip}
              onOptionSelect={(_, d) => set({ flow: { ...action.flow, skip: d.selectedOptions } }, "Change flow skip")}
            >
              <TagPickerControl>
                <TagPickerGroup>
                  {action.flow.skip.map((id) => (
                    <Tag key={id} value={id} shape="rounded">
                      {id}
                    </Tag>
                  ))}
                </TagPickerGroup>
                <TagPickerInput aria-label="Skip arrows" />
              </TagPickerControl>
              <TagPickerList>
                {action.targets.filter((t) => !action.flow.skip.includes(t)).map((t) => (
                  <TagPickerOption key={t} value={t}>
                    {t}
                  </TagPickerOption>
                ))}
              </TagPickerList>
            </TagPicker>
          </Field>
          <SelectField
            label="Continue from arrow"
            value={action.flow.chainFrom ?? "none"}
            options={[{ value: "none", text: "None" }, ...connectorIds.filter((c) => !action.targets.includes(c)).map((c) => ({ value: c, text: c }))]}
            onCommit={(v) => set({ flow: { ...action.flow, chainFrom: v === "none" ? undefined : v } }, "Change flow chain")}
          />
        </>
      )}
      <Row>
        {canSplitAction(action) ? (
          <Tooltip content="One action for each element, so that each element can have its own delay and duration" relationship="description">
            <Button size="small" appearance="subtle" icon={<SplitVertical20Regular />} onClick={() => splitAction(step.id, action.id)}>
              Split per element
            </Button>
          </Tooltip>
        ) : (
          <div />
        )}
        <Button size="small" appearance="subtle" icon={<Delete20Regular />} onClick={() => removeAction(step.id, action.id)}>
          Remove action
        </Button>
      </Row>
    </div>
  );
}

export function StepInspector({ step }: { step: Step }) {
  const styles = useStyles();
  const hasVoice = useEditor((s) => s.scene.audio.some((t) => t.kind === "voiceover"));
  const startMs = useEditor((s) => s.timeline.steps.find((t) => t.id === step.id)?.startMs ?? 0);
  const line = useEditor((s) => s.scene.script.find((l) => l.stepId === step.id));
  return (
    <>
      <TextField label="Title" value={step.title} onCommit={(v) => updateStep(step.id, { title: v }, "Rename step")} />
      <Row>
        <SelectField
          label="Start"
          value={step.trigger.kind}
          options={[
            { value: "auto", text: "Automatic" },
            { value: "click", text: "On click" },
            ...(hasVoice || step.trigger.kind === "cue" ? [{ value: "cue" as const, text: "At voiceover cue" }] : []),
          ]}
          onCommit={(v) => (v === "cue" ? setCue(step.id, startMs, "Change step start") : updateStep(step.id, { trigger: { kind: v } }, "Change step start"))}
        />
        <NumberField label="Hold (ms)" value={step.holdMs} min={0} step={100} onCommit={(v) => updateStep(step.id, { holdMs: Math.round(v) }, "Change hold")} />
      </Row>
      {step.trigger.kind === "cue" && (
        <NumberField label="Cue time (ms)" value={step.trigger.atMs} min={0} step={100} onCommit={(v) => setCue(step.id, v, "Move cue")} />
      )}
      <TextField label="Script line" multiline value={line?.text ?? ""} placeholder="The words of the voiceover for this step" onCommit={(v) => setStepLine(step.id, v)} />
      <TextField label="Speaker notes" multiline value={step.notes ?? ""} placeholder="Notes for present mode" onCommit={(v) => updateStep(step.id, { notes: v === "" ? null : v }, "Change notes")} />

      <div className={styles.headerRow}>
        <Text size={200} weight="semibold" className={styles.heading}>
          Actions
        </Text>
        <AddActionMenu appearance="subtle" />
      </div>
      {step.actions.length === 0 ? (
        <Text size={200} className={styles.muted}>
          Select elements on the canvas, then add an action. Or move an element to record a morph.
        </Text>
      ) : (
        <Accordion collapsible multiple>
          {step.actions.map((a) => (
            <AccordionItem key={a.id} value={a.id}>
              <AccordionHeader size="small">
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <Text size={200} weight="semibold">
                    {describe(a)}
                  </Text>
                  <Tooltip content={a.targets.join(", ")} relationship="description">
                    <span className={styles.targets}>{a.targets.join(", ")}</span>
                  </Tooltip>
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <ActionEditor step={step} action={a} />
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      <Comments kind="step" id={step.id} />
    </>
  );
}
