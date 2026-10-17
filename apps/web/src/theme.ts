import { type BrandVariants, createDarkTheme, createLightTheme, type Theme } from "@fluentui/react-components";

/** Anivo brand ramp (blue), from dark (10) to light (160). Matches the scene accent color. */
const brand: BrandVariants = {
  10: "#020305",
  20: "#0E1A2C",
  30: "#112B4B",
  40: "#123764",
  50: "#13447E",
  60: "#145199",
  70: "#1A5FB4",
  80: "#1F6FEB",
  90: "#3F82F0",
  100: "#5A94F3",
  110: "#73A6F6",
  120: "#8BB7F8",
  130: "#A2C7FA",
  140: "#BAD7FC",
  150: "#D1E6FD",
  160: "#E8F3FF",
};

export const lightTheme: Theme = createLightTheme(brand);
export const darkTheme: Theme = { ...createDarkTheme(brand), colorBrandForeground1: brand[110], colorBrandForeground2: brand[120] };
