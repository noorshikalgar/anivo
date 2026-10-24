import { defaultDurationMs } from "@anivo/schema";
import { SOUNDS } from "@anivo/engine";
import type { Action, Step } from "@anivo/schema";
import {
  Combobox,
  Menu,
  MenuDivider,
  MenuGroup,
  MenuGroupHeader,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Tag,
  TagPicker,
  TagPickerControl,
  TagPickerGroup,
  TagPickerInput,
  TagPickerList,
  TagPickerOption,
  makeStyles,
} from "@fluentui/react-components";
import { Add16Regular, Speaker216Regular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { searchIcons } from "@anivo/render";
import { pickImageAsset } from "../images.js";
import { withErrors } from "../notify.js";
import { addAction, addMatchingExit, addMotionAlongArrow, updateAction, updateStep } from "../commands.js";
import { previewSound, setCue, setStepLine } from "../audio.js";
import { Comments } from "./Comments.js";
import { MarkEditor } from "./MarkEditor.js";
import { useEditor } from "../store.js";
import { ColorField, NumberField, Row, SelectField, TextField } from "./fields.js";
import { actionIcon } from "./typeIcons.js";
import { Btn, Check, MenuButtonSmall, Note, Panel, Prop } from "./ui.js";

const useStyles = makeStyles({
  panel: { display: "flex", flexDirection: "column", gap: "2px" },
});

/** Sound names in the list. */
const SOUND_TEXT: Partial<Record<string, string>> = { keys: "Keys (typing, whole action)", ticks: "Ticks (counting, whole action)", rise: "Rise (whoosh up)", error: "Error (buzz)", success: "Success (three notes)" };

export const ENTER_EFFECTS = ["rise", "fade", "pop", "blur", "scale", "slide", "draw-on", "wipe", "typewriter", "cascade", "scramble"] as const;
export const EMPHASIS_EFFECTS = ["pulse", "shake", "wiggle", "glow", "flash", "highlight", "focus", "march", "float", "breathe"] as const;
const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out", "back-out", "spring-soft", "spring-bouncy", "smooth", "hold"] as const;
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

export function describe(a: Action): string {
  if (a.type === "enter" || a.type === "exit" || a.type === "emphasis") return `${label(a.type)} · ${a.effect}`;
  if (a.type === "morph") return `Morph · ${Object.keys(a.to).join(", ")}`;
  if (a.type === "camera") return `Camera · ${a.camera.op}`;
  if (a.type === "counter") return `Count · ${a.counter.from} to ${a.counter.to}`;
  if (a.type === "motion") return a.motion.along ? `Send along ${a.motion.along}${a.motion.reverse ? " (back)" : ""}` : `Move along a path · ${a.motion.points.length} points`;
  if (a.type === "mark") return a.mark.clear ? `Mark · clear${a.mark.phrase ? ` · "${a.mark.phrase}"` : ""}` : `Mark · "${a.mark.phrase}"`;
  if (a.type === "code") return `Code · ${a.code.op}${a.code.lines ? ` ${a.code.lines[0]}-${a.code.lines[1]}` : ""}`;
  return label(a.type);
}

/** Menu that adds an action for the selected elements to the selected step. */
export function AddActionMenu({ iconOnly }: { iconOnly?: boolean }) {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => s.scene.elements);
  const connectors = selection.filter((id) => elements[id]?.type === "connector");
  const texts = selection.filter((id) => elements[id]?.type === "text");
  const codes = selection.filter((id) => elements[id]?.type === "code");
  const none = selection.length === 0;
  const add = (action: Record<string, unknown>, name: string) => addAction({ targets: selection, ...action }, name);
  const step = useEditor((s) => s.selectedStep);
  const sub = (title: string, type: "enter" | "exit" | "emphasis", effects: readonly string[]) => (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <MenuItem icon={actionIcon(type)} disabled={none}>
          {title}
        </MenuItem>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {effects.map((e) => (
            <MenuItem key={e} onClick={() => add({ type, effect: e }, `Add ${type}`)}>
              {label(e)}
            </MenuItem>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <MenuButtonSmall icon={<Add16Regular />} iconOnly={iconOnly} aria-label="Add action" disabled={none && step === null}>
          Add action
        </MenuButtonSmall>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuGroup>
            <MenuGroupHeader>{none ? "Select elements first" : `For ${selection.length === 1 ? selection[0] : `${selection.length} elements`}`}</MenuGroupHeader>
            {sub("Enter", "enter", ENTER_EFFECTS)}
            {sub("Exit", "exit", ENTER_EFFECTS)}
            {sub("Emphasis", "emphasis", EMPHASIS_EFFECTS)}
            <MenuItem icon={actionIcon("flow")} disabled={connectors.length === 0} onClick={() => addAction({ type: "flow", targets: connectors, flow: connectors.length > 1 ? { distribute: "round-robin" } : {} }, "Add flow")}>
              Flow {connectors.length === 0 ? "(select an arrow)" : ""}
            </MenuItem>
            <MenuItem icon={actionIcon("motion")} disabled={connectors.length !== 1 || selection.length < 2 || step === null} onClick={() => void addMotionAlongArrow()}>
              Send along the selected arrow
            </MenuItem>
            <MenuItem icon={actionIcon("counter")} disabled={texts.length === 0} onClick={() => addAction({ type: "counter", targets: texts, counter: { from: 0, to: 100 } }, "Add count")}>
              Count {texts.length === 0 ? "(select a text)" : ""}
            </MenuItem>
          </MenuGroup>
          <MenuDivider />
          <MenuGroup>
            <MenuGroupHeader>Camera</MenuGroupHeader>
            <MenuItem icon={actionIcon("camera")} disabled={none} onClick={() => addAction({ type: "camera", targets: selection, camera: { op: "zoom-to" } }, "Add camera zoom")}>
              Camera: zoom to selection
            </MenuItem>
            <MenuItem icon={actionIcon("camera")} onClick={() => addAction({ type: "camera", targets: selection, camera: { op: "drift" } }, "Add camera drift")}>
              Camera: slow drift in {selection.length ? "(to the selection)" : ""}
            </MenuItem>
            <MenuItem icon={actionIcon("camera")} disabled={none} onClick={() => addAction({ type: "camera", targets: selection.slice(0, 1), camera: { op: "follow" } }, "Add camera follow")}>
              Camera: follow the selection
            </MenuItem>
            <MenuItem icon={actionIcon("camera")} onClick={() => addAction({ type: "camera", camera: { op: "reset" } }, "Add camera reset")}>
              Camera: reset to the full view
            </MenuItem>
          </MenuGroup>
          <MenuDivider />
          <MenuGroup>
            <MenuGroupHeader>Code</MenuGroupHeader>
            <MenuItem icon={actionIcon("code")} disabled={codes.length === 0} onClick={() => addAction({ type: "code", targets: codes, code: { op: "highlight", lines: [1, 1] } }, "Add code highlight")}>
              Code: highlight lines {codes.length === 0 ? "(select a code block)" : ""}
            </MenuItem>
            <MenuItem icon={actionIcon("code")} disabled={codes.length === 0} onClick={() => addAction({ type: "code", targets: codes, code: { op: "type", lines: [1, 1] } }, "Add code typing")}>
              Code: type lines
            </MenuItem>
            <MenuItem icon={actionIcon("code")} disabled={codes.length !== 1} onClick={() => addAction({ type: "code", targets: codes, code: { op: "diff", newCode: (elements[codes[0]!] as { code?: string } | undefined)?.code ?? "" } }, "Add code change")}>
              Code: change the code
            </MenuItem>
          </MenuGroup>
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
    <Prop label="Icon">
      <Combobox
        style={{ minWidth: 0, width: "100%" }}
        placeholder="Search, for example mail"
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
    </Prop>
  );
}

/** What moves along the arrows of a flow (FR-STEP-07): shape, icon, image, size, color, amount, trail, and turn. */
function FlowParticle({ step, action, theme }: { step: Step; action: FlowAction; theme: string }) {
  const f = action.flow;
  const assets = useEditor((s) => s.scene.assets);
  const images = useMemo(() => Object.entries(assets).filter(([, a]) => a.mime.startsWith("image/")), [assets]);
  const set = (next: Partial<FlowAction["flow"]>, label = "Change flow particle", mergeKey?: string) => {
    const flow: Record<string, unknown> = { ...f, ...next };
    for (const k of Object.keys(flow)) if (flow[k] === undefined) delete flow[k];
    updateAction(step.id, action.id, { flow }, label, mergeKey);
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
          <Prop label="">
            <Btn
              onClick={() =>
                void withErrors(async () => {
                  const r = await pickImageAsset();
                  if (!r) return;
                  useEditor.getState().apply({ label: "Change flow image", ops: [...r.ops, { op: "action.update", step: step.id, id: action.id, set: { flow: { ...f, shape: "image", assetId: r.id } } }] });
                })
              }
            >
              Choose file…
            </Btn>
          </Prop>
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
        <Prop label="">
          <Check label="Turn along the arrow" checked={f.orient} onChange={(v) => set({ orient: v })} />
        </Prop>
      </Row>
    </>
  );
}

/** Direction both: own settings for the particles that go back (end to start). */
function BackFlow({ step, action, theme }: { step: Step; action: FlowAction; theme: string }) {
  const f = action.flow;
  const b = f.back;
  const setBack = (next: Record<string, unknown> | null, label = "Change back particles", mergeKey?: string) => {
    const flow: Record<string, unknown> = { ...f };
    if (next === null) delete flow["back"];
    else {
      const back: Record<string, unknown> = { ...(b ?? {}), ...next };
      for (const k of Object.keys(back)) if (back[k] === undefined) delete back[k];
      flow["back"] = back;
    }
    updateAction(step.id, action.id, { flow }, label, mergeKey);
  };
  const amount = b?.count === undefined ? "stream" : b.count === 1 ? "once" : "count";
  return (
    <>
      <Prop label="Back">
        <Check label="Own settings for the way back" checked={!!b} onChange={(v) => setBack(v ? { color: f.color === "accent" ? "success" : "accent" } : null, v ? "Own back settings" : "Same back settings")} />
      </Prop>
      {!b && <Note>Both ways alternate with the same particles. Turn on own settings to give the way back its own particle, color, speed, and amount.</Note>}
      {b && (
        <>
          <SelectField
            label="Back particle"
            value={b.shape ?? f.shape}
            options={[
              { value: "dot", text: "Dot" },
              { value: "square", text: "Square" },
              { value: "pill", text: "Pill" },
              { value: "icon", text: "Icon" },
            ]}
            onCommit={(v) => setBack({ shape: v, ...(v === "icon" && !b.icon ? { icon: "lucide:check", size: Math.max(b.size ?? f.size, 28) } : {}) })}
          />
          {(b.shape ?? f.shape) === "icon" && <IconField value={b.icon ?? f.icon} onCommit={(v) => setBack({ icon: v })} />}
          <ColorField label="Back color" theme={theme} value={b.color ?? f.color} onCommit={(v) => setBack({ color: v ?? undefined })} />
          <NumberField label="Back size (px)" value={b.size ?? f.size} min={2} max={400} step={2} onCommit={(v, k) => setBack({ size: v }, "Change back size", k)} />
          <NumberField label="Back speed (px/s)" value={b.speed ?? f.speed} min={10} step={50} onCommit={(v, k) => setBack({ speed: v }, "Change back speed", k)} />
          <SelectField
            label="Back particles"
            value={amount}
            options={[
              { value: "stream", text: "A stream" },
              { value: "once", text: "One particle" },
              { value: "count", text: "A number" },
            ]}
            onCommit={(v) => setBack({ count: v === "stream" ? undefined : v === "once" ? 1 : 3 })}
          />
          {amount === "stream" && <NumberField label="Back rate (per s)" value={b.rate ?? f.rate} min={0.1} step={0.5} onCommit={(v, k) => setBack({ rate: v }, "Change back rate", k)} />}
          {amount === "count" && <NumberField label="Back number" value={b.count ?? 3} min={2} max={100} onCommit={(v) => setBack({ count: Math.round(v) })} />}
          <NumberField label="Back delay (ms)" value={b.delayMs ?? 0} min={0} step={100} onCommit={(v, k) => setBack({ delayMs: Math.round(v) }, "Change back delay", k)} />
        </>
      )}
    </>
  );
}

/** The settings of one action. `part`: "what" (effect and its settings), "when" (timing and sound), or "all". */
export function ActionEditor({ step, action, part = "all" }: { step: Step; action: Action; part?: "all" | "what" | "when" }) {
  const what = part !== "when";
  const when = part !== "what";
  const styles = useStyles();
  const theme = useEditor((s) => s.scene.settings.theme);
  const elements = useEditor((s) => s.scene.elements);
  // Derive the list outside the store selector: a new array from a selector re-renders without end.
  const connectorIds = useMemo(() => Object.values(elements).filter((e) => e.type === "connector").map((e) => e.id), [elements]);
  const set = (s: Record<string, unknown>, name?: string, mergeKey?: string) => updateAction(step.id, action.id, s, name, mergeKey);
  const duration = action.durationMs ?? defaultDurationMs(action);
  return (
    <div className={styles.panel}>
      {what && (
        <>
      {(action.type === "enter" || action.type === "exit") && (
        <SelectField label="Effect" value={action.effect} options={ENTER_EFFECTS.map((e) => ({ value: e, text: label(e) }))} onCommit={(v) => set({ effect: v }, "Change effect")} />
      )}
      {action.type === "enter" && (
        <Row>
          <Btn title="Add an exit with the same effect, after the step content" onClick={() => addMatchingExit(step.id, action.id, "after")}>
            Add matching exit
          </Btn>
          <Btn title="Add an exit with the same effect, when the next step starts" onClick={() => addMatchingExit(step.id, action.id, "next-step")}>
            Exit at next step
          </Btn>
        </Row>
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
      {(action.type === "enter" || action.type === "exit") && action.effect === "typewriter" && (
        <SelectField
          label="Type by"
          value={action.params.unit ?? "char"}
          options={[
            { value: "char", text: "Letter" },
            { value: "word", text: "Word" },
          ]}
          onCommit={(v) => set({ params: { ...action.params, unit: v as "char" | "word" } }, "Change typing")}
        />
      )}
      {action.type === "emphasis" && ["pulse", "shake", "wiggle"].includes(action.effect) && (
        <NumberField label="Count" value={action.params.count ?? (action.effect === "pulse" ? 2 : action.effect === "shake" ? 4 : 3)} min={1} max={20} onCommit={(v) => set({ params: { ...action.params, count: Math.round(v) } }, "Change count")} />
      )}
      {action.type === "emphasis" && ["glow", "flash", "highlight"].includes(action.effect) && (
        <ColorField label="Color" theme={theme} value={action.params.color} onCommit={(v) => set({ params: { ...action.params, color: v ?? undefined } }, "Change color")} />
      )}
        </>
      )}
      {when && (
        <>
      <Row>
        <NumberField label="Delay (ms)" value={action.delayMs} min={0} step={50} onCommit={(v, k) => set({ delayMs: Math.round(v) }, "Change delay", k)} />
        <NumberField label="Duration (ms)" value={duration} min={0} step={50} onCommit={(v, k) => set({ durationMs: Math.round(v) }, "Change duration", k)} />
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
      <Row>
        {action.targets.length > 1 && action.staggerMs > 0 ? (
          <SelectField
            label="Stagger order"
            value={action.staggerOrder ?? "in-order"}
            options={[
              { value: "in-order", text: "In order" },
              { value: "reverse", text: "Reverse" },
              { value: "center", text: "From the center" },
              { value: "edges", text: "From the edges" },
              { value: "random", text: "Shuffle" },
            ]}
            onCommit={(v) => set({ staggerOrder: v === "in-order" ? null : v }, "Change stagger order")}
          />
        ) : (
          <div />
        )}
      </Row>
      <SelectField
        label="Sound"
        value={action.sound ?? "none"}
        options={[{ value: "none", text: "No sound" }, ...SOUNDS.map((x) => ({ value: x, text: SOUND_TEXT[x] ?? label(x) }))]}
        onCommit={(v) => {
          set({ sound: v === "none" ? null : v }, "Change sound");
          if (v !== "none") previewSound(v);
        }}
      />
      {action.sound && (
        <Prop label="">
          <Btn icon={<Speaker216Regular />} onClick={() => action.sound && previewSound(action.sound)}>
            Play the sound
          </Btn>
        </Prop>
      )}
        </>
      )}
      {what && (
        <>

      {what && action.type === "mark" && <MarkEditor action={action} set={set} />}
      {action.type === "motion" && action.motion.along && (
        <Row>
          <SelectField
            label="Arrow"
            value={action.motion.along}
            options={Object.values(useEditor.getState().scene.elements)
              .filter((e) => e.type === "connector")
              .map((e) => ({ value: e.id, text: e.id }))}
            onCommit={(v) => set({ motion: { ...action.motion, along: v } }, "Change arrow")}
          />
          <SelectField label="Direction" value={action.motion.reverse ? "back" : "forward"} options={[{ value: "forward", text: "Start to end" }, { value: "back", text: "End to start" }]} onCommit={(v) => set({ motion: { ...action.motion, reverse: v === "back" } }, "Change direction")} />
        </Row>
      )}
      {action.type === "motion" && !action.motion.along && (
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
          <Row>
            <SelectField
              label="Number style"
              value={action.counter.style ?? "plain"}
              options={[
                { value: "plain", text: "Plain (12400)" },
                { value: "thousands", text: "Thousands (12,400)" },
                { value: "compact", text: "Short (12.4K)" },
                { value: "duration", text: "Time (2:05)" },
              ]}
              onCommit={(v) => set({ counter: { ...action.counter, style: v === "plain" ? undefined : v } }, "Change number style")}
            />
            <div />
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
          {action.flow.direction === "both" && <BackFlow step={step} action={action} theme={theme} />}
          <Prop label="Skip arrows">
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
          </Prop>
          <SelectField
            label="Continue from arrow"
            value={action.flow.chainFrom ?? "none"}
            options={[{ value: "none", text: "None" }, ...connectorIds.filter((c) => !action.targets.includes(c)).map((c) => ({ value: c, text: c }))]}
            onCommit={(v) => set({ flow: { ...action.flow, chainFrom: v === "none" ? undefined : v } }, "Change flow chain")}
          />
        </>
      )}
        </>
      )}
    </div>
  );
}

export function StepInspector({ step }: { step: Step }) {
  const hasVoice = useEditor((s) => s.scene.audio.some((t) => t.kind === "voiceover"));
  const startMs = useEditor((s) => s.timeline.steps.find((t) => t.id === step.id)?.startMs ?? 0);
  const line = useEditor((s) => s.scene.script.find((l) => l.stepId === step.id));
  return (
    <>
      <Panel id="step-step" title="Settings">
        <TextField label="Title" value={step.title} onCommit={(v) => updateStep(step.id, { title: v }, "Rename step")} />
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
        {step.trigger.kind === "cue" && <NumberField label="Cue time (ms)" value={step.trigger.atMs} min={0} step={100} onCommit={(v) => setCue(step.id, v, "Move cue")} />}
        <NumberField label="Hold (ms)" value={step.holdMs} min={0} step={100} onCommit={(v, k) => updateStep(step.id, { holdMs: Math.round(v) }, "Change hold", k)} />
      </Panel>
      <Panel id="step-transition" title="Transition">
        <SelectField
          label="Transition"
          value={step.transition?.kind ?? "none"}
          options={[
            { value: "none", text: "None (cut)" },
            { value: "fade", text: "Fade through background" },
            { value: "dip", text: "Dip to black" },
            { value: "flash", text: "Flash white" },
            { value: "wipe", text: "Wipe" },
            { value: "zoom", text: "Zoom through" },
            { value: "blur", text: "Blur through" },
            { value: "slide", text: "Slide (accent panel)" },
          ]}
          onCommit={(v) => updateStep(step.id, { transition: v === "none" ? null : { kind: v, durationMs: step.transition?.durationMs ?? 600 } }, "Change transition")}
        />
        {step.transition && (
          <NumberField label="Duration (ms)" value={step.transition.durationMs} min={100} max={4000} step={100} onCommit={(v, k) => updateStep(step.id, { transition: { ...step.transition!, durationMs: Math.round(v) } }, "Change transition", k)} />
        )}
        <Note>The transition covers the whole frame around the start of the step: half before, half after.</Note>
      </Panel>

      <Panel id="step-actions-summary" title={`Actions (${step.actions.length})`}>
        {step.actions.map((a) => (
          <Note key={a.id}>{`${describe(a)}: ${a.targets.join(", ") || "camera"}`}</Note>
        ))}
        {step.actions.length === 0 && <Note>No actions yet.</Note>}
        <Prop label="">
          <Btn onClick={() => useEditor.setState({ propTab: "actions" })}>Edit the actions…</Btn>
        </Prop>
      </Panel>

      <Panel id="step-voice" title="Script and notes">
        <TextField label="Script line" multiline value={line?.text ?? ""} placeholder="The words of the voiceover for this step" onCommit={(v) => setStepLine(step.id, v)} />
        <TextField label="Speaker notes" multiline value={step.notes ?? ""} placeholder="Notes for present mode" onCommit={(v) => updateStep(step.id, { notes: v === "" ? null : v }, "Change notes")} />
      </Panel>
      <Panel id="step-comments" title="Comments" defaultOpen={false}>
        <Comments kind="step" id={step.id} />
      </Panel>
    </>
  );
}
