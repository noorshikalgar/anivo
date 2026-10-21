import type { FrameColor } from "@anivo/engine";
import type { CustomTheme, ElementType } from "@anivo/schema";
import { type Rgba, mixOklch, parseHex } from "./color.js";

export interface Theme {
  name: string;
  dark: boolean;
  /** Color tokens. Element styles and actions refer to these names. */
  tokens: Record<string, string>;
  fonts: { clean: string; sketch: string; code: string };
  /** Default style for each element type, as token names. */
  defaults: { fill: string; stroke: string; textColor: string; strokeWidth: number; cornerRadius: number; fontSize: number; shadow?: "none" | "soft" | "hard" | "glow"; shadowColor?: string };
}

const slateDarkTokens = {
  background: "#0F1720",
  grid: "#1E2A36",
  surface: "#1B2631",
  "surface-strong": "#26333F",
  text: "#E6EDF3",
  muted: "#8B98A5",
  line: "#5B6B7A",
  accent: "#4C9AFF",
  "accent-soft": "#16324F",
  danger: "#F26D6D",
  "danger-soft": "#4A1E22",
  success: "#4CC38A",
  "success-soft": "#16382A",
  warning: "#F5B84A",
  "warning-soft": "#4A3714",
  purple: "#A78BFA",
  teal: "#2DD4BF",
};

const slateLightTokens = {
  background: "#F7F8FA",
  grid: "#E3E7EC",
  surface: "#FFFFFF",
  "surface-strong": "#EEF1F5",
  text: "#1B2631",
  muted: "#5F6B77",
  line: "#7A8794",
  accent: "#1F6FEB",
  "accent-soft": "#DCEBFF",
  danger: "#D64545",
  "danger-soft": "#FBE3E3",
  success: "#1E8E5A",
  "success-soft": "#DDF3E8",
  warning: "#B7791F",
  "warning-soft": "#FCEFD5",
  purple: "#7C5CE0",
  teal: "#0E9F8E",
};

/** Warm paper look. Good with the sketch style. */
const paperLightTokens = {
  background: "#FBF8F1",
  grid: "#ECE6D8",
  surface: "#FFFFFF",
  "surface-strong": "#F3EEE2",
  text: "#2B2620",
  muted: "#6E665B",
  line: "#5E5649",
  accent: "#C2571A",
  "accent-soft": "#FBE4D3",
  danger: "#C23A3A",
  "danger-soft": "#F8DCDC",
  success: "#3E7F3A",
  "success-soft": "#E1F0DC",
  warning: "#A86B00",
  "warning-soft": "#FBEBC8",
  purple: "#6D4BB8",
  teal: "#13807A",
};

/** High contrast dark look. Good for small text on phones. */
const nightDarkTokens = {
  background: "#05070A",
  grid: "#151A21",
  surface: "#10151C",
  "surface-strong": "#1B222C",
  text: "#F5F7FA",
  muted: "#A3ADBA",
  line: "#8794A3",
  accent: "#7C9CFF",
  "accent-soft": "#1C2550",
  danger: "#FF6B6B",
  "danger-soft": "#4D1717",
  success: "#5BE09B",
  "success-soft": "#103B27",
  warning: "#FFC861",
  "warning-soft": "#4A3510",
  purple: "#C3A6FF",
  teal: "#4FE3CF",
};

/** Pop: bold black lines, bright fills, and hard shadows (neo-brutalist). */
const popLightTokens = {
  background: "#FFF4E0",
  grid: "#F0DFC0",
  surface: "#FFFFFF",
  "surface-strong": "#FFE7B8",
  text: "#111111",
  muted: "#5A5045",
  line: "#111111",
  accent: "#2F6BFF",
  "accent-soft": "#BFD2FF",
  danger: "#E5383B",
  "danger-soft": "#FFC9C9",
  success: "#14A44D",
  "success-soft": "#B9F5CF",
  warning: "#F5A300",
  "warning-soft": "#FFE08A",
  purple: "#7C4DFF",
  teal: "#00B3A4",
};

/** Neon: deep night and bright neon colors. No glow by default: a glow on all shapes is too much (docs/17 F4). */
const neonDarkTokens = {
  background: "#0A0A1A",
  grid: "#1A1A38",
  surface: "#14142B",
  "surface-strong": "#1F1F45",
  text: "#F4F4FF",
  muted: "#9C9CD0",
  line: "#5D5DFF",
  accent: "#00E5FF",
  "accent-soft": "#063A48",
  danger: "#FF3D7F",
  "danger-soft": "#40102A",
  success: "#39FF88",
  "success-soft": "#0C3B26",
  warning: "#FFD23F",
  "warning-soft": "#3D3210",
  purple: "#B26BFF",
  teal: "#00FFD5",
};

const fonts = { clean: "Inter", sketch: "Kalam", code: "JetBrains Mono" };
const defaults = { fill: "surface", stroke: "line", textColor: "text", strokeWidth: 2, cornerRadius: 12, fontSize: 32 };

export const THEMES: Record<string, Theme> = {
  "slate-dark": { name: "slate-dark", dark: true, tokens: slateDarkTokens, fonts, defaults },
  "slate-light": { name: "slate-light", dark: false, tokens: slateLightTokens, fonts, defaults },
  "paper-light": { name: "paper-light", dark: false, tokens: paperLightTokens, fonts, defaults },
  "night-dark": { name: "night-dark", dark: true, tokens: nightDarkTokens, fonts, defaults: { ...defaults, strokeWidth: 2.5 } },
  "pop-light": { name: "pop-light", dark: false, tokens: popLightTokens, fonts, defaults: { ...defaults, strokeWidth: 3, cornerRadius: 14, shadow: "hard", shadowColor: "line" } },
  "neon-dark": { name: "neon-dark", dark: true, tokens: neonDarkTokens, fonts, defaults: { ...defaults, stroke: "accent", strokeWidth: 2 } },
};

export function getTheme(name: string): Theme {
  return THEMES[name] ?? THEMES["slate-dark"]!;
}

const customCache = new WeakMap<object, Theme>();

/** A built-in theme with the changes of a custom theme. */
export function customTheme(c: CustomTheme): Theme {
  const known = customCache.get(c);
  if (known) return known;
  const b = getTheme(c.base);
  const t: Theme = {
    ...b,
    name: c.name,
    dark: c.dark ?? b.dark,
    tokens: { ...b.tokens, ...c.tokens },
    defaults: { ...b.defaults, ...(c.strokeWidth !== undefined ? { strokeWidth: c.strokeWidth } : {}), ...(c.cornerRadius !== undefined ? { cornerRadius: c.cornerRadius } : {}) },
  };
  customCache.set(c, t);
  return t;
}

/** The theme of a scene: its custom theme if the name matches, else a built-in theme. */
export function sceneTheme(scene: { settings: { theme: string; customTheme?: CustomTheme | undefined } }, name = scene.settings.theme): Theme {
  const c = scene.settings.customTheme;
  return c && c.name === name ? customTheme(c) : getTheme(name);
}

/** The default token for a color role of an element type. */
function defaultToken(theme: Theme, role: "fill" | "stroke" | "textColor", type: ElementType): string {
  if (role === "fill" && (type === "text" || type === "connector" || type === "line" || type === "icon" || type === "group")) return "transparent";
  if (role === "stroke" && type === "text") return "transparent";
  return theme.defaults[role];
}

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/** Resolve a token or hex color. `default` resolves to the role default. */
export function resolveToken(theme: Theme, value: string, role: "fill" | "stroke" | "textColor", type: ElementType): Rgba {
  const v = value === "default" ? defaultToken(theme, role, type) : value;
  if (v === "transparent") return TRANSPARENT;
  if (v.startsWith("#")) return parseHex(v);
  const hex = theme.tokens[v];
  if (hex) return parseHex(hex);
  // An unknown token resolves to the role default. Lint reports unknown tokens.
  const fallback = theme.tokens[theme.defaults[role]];
  return fallback ? parseHex(fallback) : TRANSPARENT;
}

/** Resolve a frame color, including a morph mix, to RGBA. */
export function resolveColor(theme: Theme, value: FrameColor | undefined, role: "fill" | "stroke" | "textColor", type: ElementType): Rgba {
  if (value === undefined) return resolveToken(theme, "default", role, type);
  if (typeof value === "string") return resolveToken(theme, value, role, type);
  const from = resolveToken(theme, value.from, role, type);
  const to = resolveToken(theme, value.to, role, type);
  if (from.a === 0) return { ...to, a: to.a * value.p };
  if (to.a === 0) return { ...from, a: from.a * (1 - value.p) };
  return mixOklch(from, to, value.p);
}
