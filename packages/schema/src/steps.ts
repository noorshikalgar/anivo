import * as z from "zod";
import { ActionId, Color, ElementId, Ms, Point, StepId } from "./primitives.js";

export const EasingName = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "back-out",
  "spring-soft",
  "spring-bouncy",
  "hold",
  "smooth",
]);
export type EasingName = z.infer<typeof EasingName>;

export const Easing = z.union([
  EasingName,
  z.object({ cubicBezier: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  z.object({ spring: z.object({ stiffness: z.number().positive(), damping: z.number().positive(), mass: z.number().positive() }) }),
]);
export type Easing = z.infer<typeof Easing>;

export const EnterEffect = z.enum(["fade", "pop", "scale", "slide", "draw-on", "wipe", "typewriter", "rise", "blur", "cascade", "scramble"]);
export type EnterEffect = z.infer<typeof EnterEffect>;

export const EmphasisEffect = z.enum(["pulse", "shake", "wiggle", "glow", "flash", "highlight", "focus", "march", "float", "breathe"]);
export type EmphasisEffect = z.infer<typeof EmphasisEffect>;

export const Direction = z.enum(["up", "down", "left", "right"]);

export const EffectParams = z
  .object({
    fromScale: z.number(),
    direction: Direction,
    distance: z.number(),
    fillDelay: z.number().min(0).max(1),
    cursor: z.boolean(),
    count: z.number().int().positive(),
    scale: z.number(),
    amplitude: z.number(),
    degrees: z.number(),
    color: Color,
    width: z.number(),
    dimTo: z.number().min(0).max(1),
    amount: z.number().nonnegative().describe("blur: the blur radius at the start, in pixels."),
    unit: z.enum(["char", "word"]).describe("typewriter and cascade: one character (default) or one word at a time (docs/19 R12, docs/22 D5). cascade unit=word: words rise in one by one."),
  })
  .partial();
export type EffectParams = z.infer<typeof EffectParams>;

/** Properties that a morph action can change. See docs/06 "morph". */
export const MorphableProps = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
    fill: Color,
    stroke: Color,
    strokeWidth: z.number().nonnegative(),
    cornerRadius: z.number().nonnegative(),
    fontSize: z.number().positive(),
    textColor: Color,
    label: z.string(),
    shape: z.enum(["rectangle", "ellipse", "diamond"]).describe("Path morph (FR-STEP-14): a rectangle, ellipse, or diamond changes its outline."),
  })
  .partial();
export type MorphableProps = z.infer<typeof MorphableProps>;

export const FlowParams = z.object({
  shape: z.enum(["dot", "square", "pill", "icon", "image"]).default("dot").describe("The particle. icon: set `icon`. image: set `assetId`."),
  icon: z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/).optional().describe("Icon of an icon particle, pack:name (for example lucide:mail)."),
  assetId: z.string().optional().describe("Image asset of an image particle."),
  size: z.number().positive().default(14).describe("Particle size in pixels (the width of an icon or an image)."),
  color: Color.default("accent"),
  speed: z.number().positive().default(400).describe("Pixels per second."),
  rate: z.number().positive().default(2).describe("Particles per second."),
  direction: z.enum(["forward", "reverse", "both"]).default("forward"),
  distribute: z.enum(["all", "round-robin", "random-seeded"]).default("all"),
  chainFrom: ElementId.optional().describe("Continue particles that arrive from this connector."),
  skip: z.array(ElementId).default([]),
  trail: z.number().min(0).max(1).default(0).describe("Fading copies behind each particle: 0 (none) to 1."),
  count: z.number().int().positive().optional().describe("Particles in all, then the flow stops. Omit for a stream. 1: one particle travels from start to end."),
  orient: z.boolean().default(false).describe("Turn the particle in the direction of travel."),
  back: z
    .object({
      shape: z.enum(["dot", "square", "pill", "icon", "image"]),
      icon: z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/),
      assetId: z.string(),
      size: z.number().positive(),
      color: Color,
      speed: z.number().positive(),
      rate: z.number().positive(),
      count: z.number().int().positive(),
      trail: z.number().min(0).max(1),
      orient: z.boolean(),
      delayMs: z.number().nonnegative(),
    })
    .partial()
    .optional()
    .describe("With direction both: own settings of the particles that go back (end to start). A missing setting uses the forward value. Without it, both directions alternate with the same settings."),
});
export type FlowParams = z.infer<typeof FlowParams>;

const actionBase = {
  id: ActionId,
  targets: z.array(ElementId).min(1),
  delayMs: Ms.default(0),
  after: ActionId.optional().describe("Chain (docs/21 C7): start when the action with this ID in the same step ends. delayMs is then the gap after it. If that action moves, this action moves with it."),
  durationMs: Ms.optional().describe("Omit to use the default duration for the action type."),
  easing: Easing.optional(),
  staggerMs: Ms.default(0),
  staggerOrder: z.enum(["in-order", "reverse", "center", "edges", "random"]).optional().describe("The order of the targets for the stagger (docs/21 C6). center: from the middle out. edges: from both ends in. random: a fixed shuffle."),
  sound: z
    .enum(["pop", "click", "whoosh", "ding", "thud", "tick", "blip", "chime", "rise", "bubble", "success", "error", "keys", "ticks"])
    .optional()
    .describe("A sound when the action starts (FR-AUDIO-10). keys: typing clicks and ticks: counter ticks, for the whole action."),
  soundGainDb: z.number().min(-40).max(6).optional().describe("Volume of the sound in dB. Default -6."),
};

export const EnterAction = z.object({ ...actionBase, type: z.literal("enter"), effect: EnterEffect, params: EffectParams.default({}) });
export const ExitAction = z.object({ ...actionBase, type: z.literal("exit"), effect: EnterEffect, params: EffectParams.default({}) });
export const MorphAction = z.object({ ...actionBase, type: z.literal("morph"), to: MorphableProps });
export const EmphasisAction = z.object({ ...actionBase, type: z.literal("emphasis"), effect: EmphasisEffect, params: EffectParams.default({}) });
export const FlowAction = z.object({ ...actionBase, type: z.literal("flow"), flow: FlowParams.default(FlowParams.parse({})) });
export const WaitAction = z.object({ ...actionBase, targets: z.array(ElementId).default([]), type: z.literal("wait") });

export const CameraParams = z.object({
  op: z.enum(["zoom-to", "pan", "reset", "drift", "follow"]).describe("zoom-to: fit the targets. pan: move to a rectangle. reset: go back to the scene camera. drift: a slow push-in (Ken Burns), to the targets if there are some. follow: keep the first target in the center while it moves (docs/21 C5)."),
  zoom: z.number().positive().default(1.08).describe("drift: how much closer the camera gets."),
  padding: z.number().nonnegative().default(80).describe("Space around the targets for zoom-to, in scene pixels."),
  rect: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }).optional().describe("Camera rectangle for pan."),
});
export type CameraParams = z.infer<typeof CameraParams>;

/** Moves or zooms the camera (docs/06 "camera"). The targets are the elements to fit (zoom-to). */
export const CameraAction = z.object({ ...actionBase, targets: z.array(ElementId).default([]), type: z.literal("camera"), camera: CameraParams });

/** Counts a number in a text element, for example "{n} req/s" (docs/06 "counter"). */
export const CounterAction = z.object({
  ...actionBase,
  type: z.literal("counter"),
  counter: z.object({
    from: z.number(),
    to: z.number(),
    format: z.string().default("{n}").describe("Text with {n} for the number, for example '{n} req/s'."),
    decimals: z.number().int().min(0).max(6).default(0),
    style: z
      .enum(["plain", "thousands", "compact", "duration"])
      .optional()
      .describe("How to write the number (docs/21 C9). thousands: 12,400. compact: 12.4K, 3.1M (with decimals=1). duration: the number is seconds, written as 1:05 or 1:02:05. For currency or percent, put the sign in the format: '${n}', '{n}%'."),
  }),
});

const LineRange = z.tuple([z.number().int().min(1), z.number().int().min(1)]).describe("First and last line, from 1.");

/** Code actions (docs/06 "code"): highlight lines, type lines, or change the code with a diff. */
export const CodeAction = z.object({
  ...actionBase,
  type: z.literal("code"),
  code: z.object({
    op: z.enum(["highlight", "type", "diff"]),
    lines: LineRange.optional().describe("highlight and type: the line range. highlight with no lines clears the highlight."),
    newCode: z.string().optional().describe("diff: the new code."),
  }),
});

/** Motion path (FR-STEP-15): the center of each target moves along the points. The end point is the new position. */
export const MotionAction = z.object({
  ...actionBase,
  type: z.literal("motion"),
  motion: z.object({
    points: z.array(Point).min(2).describe("Scene points. The element center goes from the first to the last point."),
    curve: z.boolean().default(false).describe("A smooth curve through the points, not straight lines."),
    orient: z.boolean().default(false).describe("Turn the element along the path."),
    along: ElementId.optional().describe("A connector. The points are the route of this connector at the step start (docs/17 P2). Sync them with the sync operation when the connector moves."),
    reverse: z.boolean().default(false).describe("With along: go from the connector end to its start."),
  }),
});

/**
 * Mark words in a text (docs/20 B1): a phrase gets its own color, a highlight
 * box, or an underline that draws in, and the other words can dim. The marks
 * stay until a mark with clear.
 */
export const MarkAction = z.object({
  ...actionBase,
  type: z.literal("mark"),
  mark: z.object({
    phrase: z.string().default("").describe("The words to mark, as in the text. Empty: no phrase (use with dim or clear)."),
    occurrence: z.number().int().positive().default(1).describe("Which match of the phrase, if the text has it more than one time."),
    color: Color.optional().describe("The text color of the phrase."),
    highlight: Color.optional().describe("A box of this color behind the phrase."),
    underline: Color.optional().describe("An underline of this color that draws in from the left."),
    strike: Color.optional().describe("A line through the phrase, of this color, that draws in from the left."),
    dim: Color.optional().describe("The color of the other words, for focus on the phrase."),
    clear: z.boolean().default(false).describe("Remove the marks of the text first."),
  }),
});

export const Action = z.discriminatedUnion("type", [EnterAction, ExitAction, MorphAction, EmphasisAction, FlowAction, WaitAction, CameraAction, CounterAction, CodeAction, MotionAction, MarkAction]);
export type Action = z.infer<typeof Action>;
export type ActionInput = z.input<typeof Action>;
export type ActionType = Action["type"];

export const Trigger = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("auto") }),
  z.object({ kind: z.literal("click") }),
  z.object({ kind: z.literal("cue"), audioId: z.string(), atMs: Ms }),
]);
export type Trigger = z.infer<typeof Trigger>;

export const Step = z.object({
  id: StepId,
  title: z.string().default(""),
  trigger: Trigger.default({ kind: "auto" }),
  durationMs: Ms.optional().describe("Omit to calculate the duration from the actions."),
  holdMs: Ms.default(500).describe("Time to hold the end state of the step."),
  actions: z.array(Action).default([]),
  notes: z.string().optional(),
  scriptLineId: z.string().optional(),
  caption: z
    .object({
      text: z.string().min(1).max(240).describe("One short sentence that tells what happens in this step."),
      anchor: ElementId.optional().describe("The element that the caption shows next to. Default: the first target of the step."),
      side: z.enum(["auto", "above", "below", "left", "right", "top", "bottom"]).default("auto").describe("auto: next to the anchor, where it covers the least. top and bottom: a band at the edge of the frame."),
    })
    .optional()
    .describe("A step caption (docs/17 P4): it types in at the step start, and the step holds until a viewer can read it."),
  transition: z
    .object({
      kind: z.enum(["fade", "dip", "flash", "wipe", "zoom", "blur", "slide"]).describe("fade: through the background color. dip: through black. flash: through white. wipe: a band of the background color moves across."),
      durationMs: Ms.default(600),
    })
    .optional()
    .describe("A transition over the whole frame at the start of the step (docs/16)."),
});
export type Step = z.infer<typeof Step>;
export type StepInput = z.input<typeof Step>;
