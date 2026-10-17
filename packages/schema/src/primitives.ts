import { z } from "zod";

/** Readable element ID, for example `lb` or `pod-1`. Agents use these IDs. */
export const ElementId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,47}$/, "Use lower-case letters, digits, and '-'. Start with a letter. Maximum 48 characters.")
  .describe("Readable element ID, for example 'lb' or 'pod-1'.");
export type ElementId = z.infer<typeof ElementId>;

/** Step and action IDs follow the same pattern as element IDs. */
export const StepId = ElementId.describe("Readable step ID, for example 's-traffic'.");
export type StepId = z.infer<typeof StepId>;

export const ActionId = ElementId.describe("Readable action ID, unique in the scene.");
export type ActionId = z.infer<typeof ActionId>;

/** A theme token (`accent`, `danger`) or a hex color (`#378ADD`). */
export const Color = z
  .string()
  .regex(/^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|[a-z][a-z0-9-]*)$/, "Use a theme token such as 'accent', or a hex color such as '#378ADD'.")
  .describe("Theme token (for example 'accent') or hex color (for example '#378ADD').");
export type Color = z.infer<typeof Color>;

/** Duration or time in milliseconds. Integer, zero or more. */
export const Ms = z.number().int().nonnegative().describe("Time in milliseconds.");

export const Point = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof Point>;

export const Rect = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() });
export type Rect = z.infer<typeof Rect>;
