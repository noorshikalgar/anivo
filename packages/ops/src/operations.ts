import { z } from "zod";

/**
 * Public operations (docs/09 "Operations"). The UI, the CLI, the MCP server,
 * and agents send these. Each field has a description in STE, because agents
 * read the JSON Schema.
 */

const Id = z.string().min(1).describe("Element ID, for example 'lb'.");
const Props = z.record(z.string(), z.unknown());

export const ElementAdd = z.object({
  op: z.literal("element.add"),
  id: z.string().optional().describe("Optional. If missing, Anivo makes a readable ID from the label or the type."),
  type: z.string().describe("Element type, for example 'rectangle', 'text', 'icon', or 'connector'."),
  props: Props.default({}).describe("Element properties. 'label' can be a string. The draw order is on top unless 'z' is set."),
});

export const ElementUpdate = z.object({
  op: z.literal("element.update"),
  id: Id,
  set: Props.describe("Properties to change. 'style' merges with the old style. 'label' can be a string. Set a property to null to remove it."),
});

export const ElementRemove = z.object({
  op: z.literal("element.remove"),
  ids: z.array(Id).min(1),
});

export const ElementRename = z.object({
  op: z.literal("element.rename"),
  id: Id,
  to: z.string().describe("New ID. Anivo updates all references: bindings, groups, and actions."),
});

export const ElementReorder = z.object({
  op: z.literal("element.reorder"),
  id: Id,
  to: z.union([z.enum(["front", "back", "forward", "backward"]), z.object({ above: Id })]),
});

export const ElementConnect = z.object({
  op: z.literal("element.connect"),
  id: z.string().optional().describe("Optional. If missing, the ID is 'c-<from>-<to>'."),
  from: Id,
  to: Id,
  props: Props.default({}).describe("Connector properties, for example route, endHead, label, style."),
});

export const ElementPlace = z.object({
  op: z.literal("element.place"),
  id: Id,
  rightOf: Id.optional(),
  leftOf: Id.optional(),
  above: Id.optional(),
  below: Id.optional(),
  gap: z.number().default(120).describe("Space between the two elements, in scene pixels."),
  align: z.enum(["start", "center", "end"]).default("center"),
});

export const LayoutApply = z.object({
  op: z.literal("layout.apply"),
  ids: z.array(Id).min(1).describe("Elements to place. Connectors between them give the order for layered and tree layouts."),
  kind: z.enum(["row", "column", "grid", "tree", "layered"]).describe("row, column, grid, tree (top to bottom), or layered (left to right by connections)."),
  gap: z.number().optional().describe("Space between elements in scene pixels."),
  cols: z.number().int().positive().optional().describe("Columns for a grid."),
  direction: z.enum(["right", "down"]).optional().describe("Flow direction for tree and layered layouts."),
});

export const StepAdd = z.object({
  op: z.literal("step.add"),
  id: z.string().optional().describe("Optional. If missing, Anivo makes an ID from the title."),
  index: z.number().int().nonnegative().optional().describe("Position in the step list. Default: the end."),
  props: Props.default({}).describe("Step properties: title, trigger, durationMs, holdMs, notes, actions."),
});

export const StepUpdate = z.object({
  op: z.literal("step.update"),
  id: z.string(),
  set: Props,
});

export const StepRemove = z.object({ op: z.literal("step.remove"), id: z.string() });

export const StepMove = z.object({ op: z.literal("step.move"), id: z.string(), index: z.number().int().nonnegative() });

export const ActionAdd = z.object({
  op: z.literal("action.add"),
  step: z.string().describe("Step ID."),
  index: z.number().int().nonnegative().optional(),
  action: Props.describe("Action. The 'id' is optional. Example: { type: 'enter', effect: 'pop', targets: ['lb'] }."),
});

export const ActionUpdate = z.object({
  op: z.literal("action.update"),
  step: z.string(),
  id: z.string(),
  set: Props,
});

export const ActionRemove = z.object({ op: z.literal("action.remove"), step: z.string(), id: z.string() });

export const AssetAdd = z.object({
  op: z.literal("asset.add"),
  asset: z.record(z.string(), z.unknown()).describe("Asset reference: { id, mime, bytes, name }. The bytes are stored outside the scene."),
});

export const AudioAdd = z.object({
  op: z.literal("audio.add"),
  track: z.record(z.string(), z.unknown()).describe("Audio track: { id?, kind, assetId, durationMs, startMs?, gainDb? }. The asset must exist."),
});

export const AudioUpdate = z.object({ op: z.literal("audio.update"), id: z.string(), set: Props });

export const AudioRemove = z.object({ op: z.literal("audio.remove"), id: z.string().describe("Track ID. Cue triggers that use it become automatic.") });

export const ScriptSet = z.object({
  op: z.literal("script.set"),
  lines: z.array(z.record(z.string(), z.unknown())).describe("Script lines: { id?, text, stepId? }. They replace the old script."),
});

export const ScriptAlign = z.object({
  op: z.literal("script.align"),
  words: z
    .array(z.object({ text: z.string(), startMs: z.number().nonnegative(), endMs: z.number().nonnegative() }))
    .optional()
    .describe("Transcript words with times in the voiceover file. Omit to use the transcript of the voiceover track."),
}).describe("Align the script lines to the voiceover transcript. Each matched line sets a cue trigger on its step. Unmatched lines keep the old start.");

export const SceneSettingsOp = z.object({
  op: z.literal("scene.settings"),
  set: Props.describe("Settings to change. Nested objects (video, background, defaults) merge with the old values."),
});

export const SceneMetaOp = z.object({ op: z.literal("scene.meta"), set: Props });

export const Operation = z.discriminatedUnion("op", [
  ElementAdd,
  ElementUpdate,
  ElementRemove,
  ElementRename,
  ElementReorder,
  ElementConnect,
  ElementPlace,
  LayoutApply,
  StepAdd,
  StepUpdate,
  StepRemove,
  StepMove,
  ActionAdd,
  ActionUpdate,
  ActionRemove,
  AssetAdd,
  AudioAdd,
  AudioUpdate,
  AudioRemove,
  ScriptSet,
  ScriptAlign,
  SceneSettingsOp,
  SceneMetaOp,
]);
export type Operation = z.infer<typeof Operation>;
export type OperationInput = z.input<typeof Operation>;

export const Author = z.object({
  kind: z.enum(["user", "agent", "undo", "redo", "system"]),
  name: z.string().optional(),
});
export type Author = z.infer<typeof Author>;

export const Transaction = z.object({
  author: Author.default({ kind: "user" }),
  label: z.string().default(""),
  ops: z.array(Operation).min(1),
  baseVersion: z.number().int().nonnegative().optional().describe("Scene version that the author saw. Used to find conflicts."),
});
export type Transaction = z.infer<typeof Transaction>;
export type TransactionInput = z.input<typeof Transaction>;
