/**
 * SVG sanitizing (docs/12 "Malicious SVG"): DOMPurify with the SVG profile.
 * Removes scripts, event attributes, <foreignObject>, and external references.
 */
import DOMPurify from "dompurify";

export function sanitizeSvg(svg: string): string {
  const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ["foreignObject", "script", "style"] });
  // Only local references (#id) and embedded images (data:image/…) stay.
  return clean.replace(/\s(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _q, a: string | undefined, b: string | undefined) => {
    const v = (a ?? b ?? "").trim();
    return v.startsWith("#") || /^data:image\/(png|jpeg|webp|gif);/i.test(v) ? m : "";
  });
}
