/**
 * Style presets (docs/21 C12): the look of an element (fill, stroke, radius,
 * font, shadow), saved to apply to other elements. The place, the size, and
 * the turn point are not part of a style.
 */
import type { ElementStyle, Scene } from "@anivo/schema";
import type { OperationInput } from "./operations.js";

export interface StylePreset {
  id: string;
  name: string;
  style: ElementStyle;
}

/** The style keys that make the look. */
export const LOOK_KEYS = ["fill", "stroke", "strokeWidth", "strokeStyle", "cornerRadius", "fontFamily", "fontSize", "fontWeight", "textColor", "textAlign", "roughness", "shadow", "shadowColor", "gradient"] as const satisfies readonly (keyof ElementStyle)[];

/** The look of an element. Undefined if the element does not exist. */
export function lookOf(scene: Scene, id: string): ElementStyle | undefined {
  const el = scene.elements[id];
  if (!el) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of LOOK_KEYS) if (el.style[k] !== undefined) out[k] = el.style[k];
  return out as ElementStyle;
}

/**
 * The operations that give elements a look. Keys of the look that are not
 * set go back to the theme value, so the elements look the same as the source.
 * Groups give the look to their parts.
 */
export function applyLookOps(scene: Scene, ids: string[], look: ElementStyle): OperationInput[] {
  const targets = new Set<string>();
  const add = (id: string) => {
    const el = scene.elements[id];
    if (!el) return;
    if (el.type !== "group") return void targets.add(id);
    for (const e of Object.values(scene.elements)) if (e.parentId === id) add(e.id);
  };
  ids.forEach(add);
  const set: Record<string, unknown> = {};
  for (const k of LOOK_KEYS) set[k] = look[k] ?? null;
  return [...targets].map((id) => ({ op: "element.update", id, set: { style: set } }));
}

/** Ready-made looks that work in every theme (theme tokens only). */
export const BUILTIN_STYLES: StylePreset[] = [
  { id: "card", name: "Card", style: { fill: "surface", stroke: "line", strokeWidth: 1, cornerRadius: 16, shadow: "soft" } },
  { id: "accent", name: "Accent", style: { fill: "accent", stroke: "accent", strokeWidth: 2, cornerRadius: 12, textColor: "background", fontWeight: 700 } },
  { id: "soft", name: "Soft accent", style: { fill: "accent-soft", stroke: "accent", strokeWidth: 2, cornerRadius: 12, textColor: "text" } },
  { id: "outline", name: "Outline", style: { fill: "background", stroke: "accent", strokeWidth: 3, cornerRadius: 12 } },
  { id: "pill", name: "Pill", style: { fill: "surface-strong", stroke: "line", strokeWidth: 1, cornerRadius: 999, fontWeight: 500 } },
  { id: "ghost", name: "Ghost", style: { fill: "background", stroke: "muted", strokeWidth: 2, strokeStyle: "dashed", cornerRadius: 12, textColor: "muted" } },
  { id: "danger", name: "Danger", style: { fill: "danger-soft", stroke: "danger", strokeWidth: 2, cornerRadius: 12 } },
  { id: "success", name: "Success", style: { fill: "success-soft", stroke: "success", strokeWidth: 2, cornerRadius: 12 } },
];
