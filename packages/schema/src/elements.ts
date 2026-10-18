import { z } from "zod";
import { Color, ElementId, Point } from "./primitives.js";

export const StrokeStyle = z.enum(["solid", "dashed", "dotted"]);
export type StrokeStyle = z.infer<typeof StrokeStyle>;

export const ElementStyle = z
  .object({
    fill: Color,
    stroke: Color,
    strokeWidth: z.number().nonnegative(),
    strokeStyle: StrokeStyle,
    cornerRadius: z.number().nonnegative(),
    fontFamily: z.string(),
    fontSize: z.number().positive(),
    fontWeight: z.union([z.literal(400), z.literal(500), z.literal(700)]),
    textColor: Color,
    textAlign: z.enum(["left", "center", "right"]),
    roughness: z.number().min(0).max(3),
  })
  .partial()
  .describe("Overrides of the theme style. Omit a field to use the theme value.");
export type ElementStyle = z.infer<typeof ElementStyle>;

export const TextContent = z.object({
  text: z.string(),
  runs: z
    .array(
      z.object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
        bold: z.boolean().optional(),
        code: z.boolean().optional(),
        color: Color.optional(),
      }),
    )
    .optional(),
});
export type TextContent = z.infer<typeof TextContent>;

const base = {
  id: ElementId,
  z: z.string().min(1).describe("Fractional index for the draw order."),
  parentId: ElementId.optional().describe("Set if the element is in a group."),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().nonnegative().default(0),
  height: z.number().nonnegative().default(0),
  rotation: z.number().default(0).describe("Rotation in degrees."),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true).describe("Visible in the base state, before step 1."),
  locked: z.boolean().default(false),
  seed: z.number().int().nonnegative().default(1).describe("Seed for the sketch style. Fixed at create time."),
  style: ElementStyle.default({}),
  label: TextContent.optional(),
  meta: z.record(z.string(), z.string()).optional(),
};

const shape = <T extends string>(type: T) => z.object({ ...base, type: z.literal(type) });

export const Rectangle = shape("rectangle");
export const Ellipse = shape("ellipse");
export const Diamond = shape("diamond");
export const Line = shape("line");

export const Text = z.object({
  ...base,
  type: z.literal("text"),
  content: TextContent,
  autoSize: z.boolean().default(true),
});

export const Icon = z.object({
  ...base,
  type: z.literal("icon"),
  pack: z.string().min(1).describe("Icon pack, for example 'lucide' or 'fluent'."),
  name: z.string().min(1).describe("Icon name in the pack, for example 'server'."),
});

export const Group = shape("group");

/** Source code with syntax colors (FR-CANVAS-12). */
export const Code = z.object({
  ...base,
  type: z.literal("code"),
  language: z.string().default("ts").describe("Language for the colors: ts, js, py, go, rust, java, sql, bash, yaml, json."),
  code: z.string().describe("The source code. Lines are separated by \\n."),
  lineNumbers: z.boolean().default(true),
});

export const Side = z.enum(["top", "right", "bottom", "left", "auto"]);

export const ConnectorEnd = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bound"), elementId: ElementId, side: Side.default("auto"), offset: z.number().default(0) }),
  z.object({ kind: z.literal("free"), x: z.number(), y: z.number() }),
]);
export type ConnectorEnd = z.infer<typeof ConnectorEnd>;

export const Head = z.enum(["none", "arrow", "triangle", "dot", "bar"]);
export type Head = z.infer<typeof Head>;

export const Connector = z.object({
  ...base,
  type: z.literal("connector"),
  route: z.enum(["straight", "elbow", "curved"]).default("straight"),
  start: ConnectorEnd,
  end: ConnectorEnd,
  waypoints: z.array(Point).optional(),
  startHead: Head.default("none"),
  endHead: Head.default("arrow"),
});

export const Element = z.discriminatedUnion("type", [
  Rectangle,
  Ellipse,
  Diamond,
  Line,
  Text,
  Icon,
  Group,
  Connector,
  Code,
]);
export type Element = z.infer<typeof Element>;
export type ElementInput = z.input<typeof Element>;
export type ElementType = Element["type"];
export type ConnectorElement = z.infer<typeof Connector>;
export type TextElement = z.infer<typeof Text>;
export type IconElement = z.infer<typeof Icon>;
export type CodeElement = z.infer<typeof Code>;
