import type { Color, Element, ElementId, Rect } from "@anivo/schema";

/**
 * A color in a frame. The engine does not know the theme, so it cannot mix
 * colors. During a color morph it returns both colors and the progress. The
 * renderer resolves the tokens and mixes them in OKLCH (docs/06 "morph").
 */
export type FrameColor = Color | { from: Color; to: Color; p: number };

/** The state of one element in one frame. */
export interface ElementFrame {
  id: ElementId;
  type: Element["type"];
  z: string;
  /** The group that contains the element, if any. */
  parentId?: ElementId;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill?: FrameColor;
  stroke?: FrameColor;
  strokeWidth?: number;
  cornerRadius?: number;
  fontSize?: number;
  textColor?: FrameColor;
  /** Label text. During a label morph, `labelFrom` fades out while `label` fades in. */
  label?: string;
  labelFrom?: string;
  labelMix?: number;

  // Effect values. The renderer applies them. 1 or 0 means "no effect".
  /** Scale around the element center. */
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Part of the stroke path to draw, 0..1 (draw-on). */
  strokeProgress: number;
  /** Fill and label opacity factor, 0..1 (draw-on). */
  fillProgress: number;
  /** Clip rectangle that grows across the element (wipe). */
  wipe?: { direction: "up" | "down" | "left" | "right"; p: number };
  /** Part of the text to show, 0..1 (typewriter). */
  textReveal: number;
  /** Glow ring intensity, 0..1. */
  glow: number;
  glowColor?: Color;
  /** Flash intensity, 0..1. */
  flash: number;
  flashColor?: Color;
  /** Code block: the code, and during a diff the old code and the progress. */
  code?: string;
  codeFrom?: string;
  codeMix?: number;
  /** Code block: highlighted lines; during a change the old range and the progress. */
  codeLines?: [number, number];
  codeLinesFrom?: [number, number];
  codeLinesMix?: number;
  /** Code block: lines that type in, and the progress. */
  codeType?: { lines: [number, number]; p: number };
  /** Highlight marker intensity, 0..1. */
  highlight: number;
  highlightColor?: Color;
}

export interface Particle {
  connectorId: ElementId;
  /** Distance from the connector start in scene pixels. The renderer drops a particle past the connector end. */
  distance: number;
  /** True if the particle moves from the end to the start. */
  reverse: boolean;
  shape: "dot" | "square" | "pill";
  size: number;
  color: Color;
  trail: number;
}

export interface FrameState {
  timeMs: number;
  /** Elements in draw order (by `z`, then by `id`). */
  elements: ElementFrame[];
  particles: Particle[];
  camera: Rect;
}
