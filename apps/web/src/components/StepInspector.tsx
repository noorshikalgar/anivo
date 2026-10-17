import { defaultDurationMs } from "@anivo/schema";
import type { Action, Step } from "@anivo/schema";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Add20Regular, Delete20Regular } from "@fluentui/react-icons";
import { addAction, removeAction, updateAction, updateStep } from "../commands.js";
import { useEditor } from "../store.js";
import { NumberField, Row, SelectField, TextField } from "./fields.js";

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

function describe(a: Action): string {
  if (a.type === "enter" || a.type === "exit" || a.type === "emphasis") return `${label(a.type)} · ${a.effect}`;
  if (a.type === "morph") return `Morph · ${Object.keys(a.to).join(", ")}`;
  return label(a.type);
}

/** Menu that adds an action for the selected elements to the selected step. */
export function AddActionMenu({ appearance = "secondary" }: { appearance?: "secondary" | "subtle" }) {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => s.scene.elements);
  const connectors = selection.filter((id) => elements[id]?.type === "connector");
  const none = selection.length === 0;
  const add = (action: Record<string, unknown>, name: string) => addAction({ targets: selection, ...action }, name);
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button size="small" appearance={appearance} icon={<Add20Regular />} disabled={none}>
          Add action
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuItem>Enter</MenuItem>
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
              <MenuItem>Exit</MenuItem>
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
              <MenuItem>Emphasis</MenuItem>
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
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

function ActionEditor({ step, action }: { step: Step; action: Action }) {
  const styles = useStyles();
  const set = (s: Record<string, unknown>, name?: string) => updateAction(step.id, action.id, s, name);
  const duration = action.durationMs ?? defaultDurationMs(action);
  return (
    <div className={styles.panel}>
      {(action.type === "enter" || action.type === "exit") && (
        <SelectField label="Effect" value={action.effect} options={ENTER_EFFECTS.map((e) => ({ value: e, text: label(e) }))} onCommit={(v) => set({ effect: v }, "Change effect")} />
      )}
      {action.type === "emphasis" && <SelectField label="Effect" value={action.effect} options={EMPHASIS_EFFECTS.map((e) => ({ value: e, text: label(e) }))} onCommit={(v) => set({ effect: v }, "Change effect")} />}
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
      {action.type === "flow" && (
        <>
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
        </>
      )}
      <Button size="small" appearance="subtle" icon={<Delete20Regular />} onClick={() => removeAction(step.id, action.id)}>
        Remove action
      </Button>
    </div>
  );
}

export function StepInspector({ step }: { step: Step }) {
  const styles = useStyles();
  return (
    <>
      <TextField label="Title" value={step.title} onCommit={(v) => updateStep(step.id, { title: v }, "Rename step")} />
      <Row>
        <SelectField
          label="Start"
          value={step.trigger.kind === "cue" ? "auto" : step.trigger.kind}
          options={[
            { value: "auto", text: "Automatic" },
            { value: "click", text: "On click" },
          ]}
          onCommit={(v) => updateStep(step.id, { trigger: { kind: v } }, "Change step start")}
        />
        <NumberField label="Hold (ms)" value={step.holdMs} min={0} step={100} onCommit={(v) => updateStep(step.id, { holdMs: Math.round(v) }, "Change hold")} />
      </Row>
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
    </>
  );
}
