import type { Color, Element, ElementId, Rect } from "@anivo/schema";

/**
 * A color in a frame. The engine does not know the theme, so it cannot mix
 * colors. During a color morph it returns both colors and the progress. The
 * renderer resolves the tokens and mixes them in OKLCH (docs/06 "morph").
 */
export type FrameColor = Color | { from: Color; to: Color; p: number };

/** The state of one element in one frame. */
export interface TextMark {
  start: number;
  end: number;
  color?: Color;
  highlight?: Color;
  underline?: Color;
  strike?: Color;
  p: number;
}

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
  /** Outline of a rectangle, ellipse, or diamond after a shape morph; during it the old outline and the progress. */
  shape?: "rectangle" | "ellipse" | "diamond";
  shapeFrom?: "rectangle" | "ellipse" | "diamond";
  shapeMix?: number;

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
  /** March (seconds since the march started): the dashes of an arrow move. */
  march?: number;
  /** Letters cascade in (0 to 1): each letter rises and fades in after the one before. */
  cascade?: number;
  /** The cascade moves one word at a time (docs/22 D5: words rise). */
  cascadeWords?: boolean;
  /** Spotlight (0 to 1): the frame goes dark around this element (docs/25 K1). */
  spotlight?: number;
  /** A hand-drawn circle around the element: how much of it shows (0 to 1) and its opacity (docs/25 K2). */
  circle?: { p: number; alpha: number; color: string; shape?: "circle" | "box" | "underline" };
  /** For a circle or spotlight on a group: the box of the whole group (this part carries the mark). */
  markBox?: { x: number; y: number; width: number; height: number };
  /** The element moves along a path or an arrow now: it draws above the other elements (docs/23 G1). */
  moving?: boolean;
  /** An arrow that is on screen, but does not show because an element at its end is not on screen. */
  hiddenByEnds?: boolean;
  /** A counting number: the digits have the same width, so the text does not shake while it counts. */
  tabular?: boolean;
  /** Rolling digits (docs/25 K4): the exact value now, with its decimals; the label shows the digits. */
  roll?: { value: number; decimals: number };
  /** Scramble (0 to 1): random letters settle into the text, from the left. */
  scramble?: number;
  /** Blur radius in scene pixels (blur enter effect). */
  blur?: number;
  /** Marked words (docs/20 B1): character ranges of the text, with their look, and the share that shows (0 to 1). */
  marks?: TextMark[];
  /** The other words fade to this color (focus on the marks). */
  dimRest?: { color: Color; p: number };
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
  shape: "dot" | "square" | "pill" | "icon" | "image";
  /** Icon particle: pack:name. */
  icon?: string;
  /** Image particle: the asset. */
  assetId?: string;
  size: number;
  color: Color;
  trail: number;
  /** Turn the particle in the direction of travel. */
  orient: boolean;
}

/** A step transition over the whole frame: progress 0 to 1 over its duration (0.5 at the step start). */
export interface TransitionFrame {
  kind: "fade" | "dip" | "flash" | "wipe" | "zoom" | "blur" | "slide";
  progress: number;
}

export interface CaptionFrame {
  text: string;
  /** Share of the characters that show (typing), 0 to 1. */
  reveal: number;
  opacity: number;
  side: "auto" | "above" | "below" | "left" | "right" | "top" | "bottom";
  /** The box of the anchor element at the end of the step, in scene pixels. None: the caption uses a band. */
  anchor?: Rect;
  anchorId?: string;
  /**
   * The boxes to keep clear, at the end of the step (text marked). The caption
   * stays in one place for the whole step, also when elements move.
   */
  avoid?: (Rect & { text: boolean })[];
  /** The camera at the end of the step: the caption takes its place and size from it, so a camera drift does not move it. */
  cam?: Rect;
}

export interface FrameState {
  timeMs: number;
  /** Elements in draw order (by `z`, then by `id`). */
  elements: ElementFrame[];
  particles: Particle[];
  camera: Rect;
  /** The step caption that shows now, if any (docs/17 P4). */
  caption?: CaptionFrame;
  /** A step transition that runs now, if any. */
  transition?: TransitionFrame;
}
