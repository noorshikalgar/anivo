import { type BrandVariants, createDarkTheme, createLightTheme, type Theme } from "@fluentui/react-components";

/**
 * Editor UI theme (docs/15). The colors are CSS variables (index.html), so the
 * own controls (components/ui.tsx) and the Fluent controls use the same values.
 */

/** Brand ramp around the selection blue #4772b3, from dark (10) to light (160). */
const brand: BrandVariants = {
  10: "#05080d",
  20: "#0f1a2b",
  30: "#16263f",
  40: "#1d3353",
  50: "#254068",
  60: "#2d4e7e",
  70: "#365c94",
  80: "#4772b3",
  90: "#5580bd",
  100: "#648dc6",
  110: "#749bcf",
  120: "#86a9d8",
  130: "#99b8e0",
  140: "#adc7e8",
  150: "#c2d6ef",
  160: "#d8e5f6",
};

/** Token overrides for both themes: values come from the CSS variables. */
const shared: Partial<Theme> = {
  fontFamilyBase: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontSizeBase100: "10px",
  fontSizeBase200: "11px",
  fontSizeBase300: "12px",
  fontSizeBase400: "13px",
  fontSizeBase500: "15px",
  fontSizeBase600: "18px",
  lineHeightBase100: "14px",
  lineHeightBase200: "14px",
  lineHeightBase300: "16px",
  lineHeightBase400: "18px",
  lineHeightBase500: "20px",
  lineHeightBase600: "24px",
  borderRadiusSmall: "3px",
  borderRadiusMedium: "4px",
  borderRadiusLarge: "6px",
  borderRadiusXLarge: "8px",
  colorNeutralBackground1: "var(--ui-header)",
  colorNeutralBackground1Hover: "var(--ui-hover)",
  colorNeutralBackground1Pressed: "var(--ui-pressed)",
  colorNeutralBackground1Selected: "var(--ui-row-selected)",
  colorNeutralBackground2: "var(--ui-region)",
  colorNeutralBackground2Hover: "var(--ui-hover)",
  colorNeutralBackground3: "var(--ui-list)",
  colorNeutralBackground3Hover: "var(--ui-hover)",
  colorNeutralBackground4: "var(--ui-field)",
  colorNeutralBackground5: "var(--ui-field)",
  colorNeutralBackground6: "var(--ui-panel)",
  colorNeutralForeground1: "var(--ui-text)",
  colorNeutralForeground2: "var(--ui-text)",
  colorNeutralForeground3: "var(--ui-muted)",
  colorNeutralForeground4: "var(--ui-muted)",
  colorNeutralStroke1: "var(--ui-outline)",
  colorNeutralStroke2: "var(--ui-line)",
  colorNeutralStroke3: "var(--ui-line)",
  colorSubtleBackgroundHover: "var(--ui-hover)",
  colorSubtleBackgroundPressed: "var(--ui-pressed)",
  colorSubtleBackgroundSelected: "var(--ui-row-selected)",
  colorTransparentBackgroundHover: "var(--ui-hover)",
};

export const lightTheme: Theme = { ...createLightTheme(brand), ...shared };
export const darkTheme: Theme = { ...createDarkTheme(brand), ...shared, colorBrandForeground1: brand[120], colorBrandForeground2: brand[130], colorCompoundBrandStroke: brand[100] };
