/** RGBA color with channels in 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseHex(hex: string): Rgba {
  const h = hex.replace("#", "");
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length >= 8 ? n(6) : 1 };
}

export function toCss({ r, g, b, a }: Rgba): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return a >= 1 ? `rgb(${c(r)}, ${c(g)}, ${c(b)})` : `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${Math.round(a * 1000) / 1000})`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

interface Oklch {
  l: number;
  c: number;
  h: number;
  a: number;
}

function rgbToOklch({ r, g, b, a }: Rgba): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A), a };
}

function oklchToRgb({ l: L, c, h, a }: Oklch): Rgba {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a,
  };
}

/** Mix two colors in OKLCH (docs/06: sRGB mixing gives gray middle colors). */
export function mixOklch(from: Rgba, to: Rgba, p: number): Rgba {
  const a = rgbToOklch(from);
  const b = rgbToOklch(to);
  // A color with almost no chroma has no stable hue. Use the other hue.
  const ha = a.c < 0.02 ? b.h : a.h;
  const hb = b.c < 0.02 ? a.h : b.h;
  let dh = hb - ha;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return oklchToRgb({ l: a.l + (b.l - a.l) * p, c: a.c + (b.c - a.c) * p, h: ha + dh * p, a: a.a + (b.a - a.a) * p });
}

export function withAlpha(c: Rgba, alpha: number): Rgba {
  return { ...c, a: c.a * alpha };
}
