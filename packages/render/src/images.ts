/**
 * Decoded images for image elements (FR-CANVAS-13). Rendering is synchronous,
 * so each platform decodes the image assets first and registers them here:
 * the browser with createImageBitmap, Node with @napi-rs/canvas.
 * An image that is not registered draws as a placeholder.
 */
export interface DecodedImage {
  width: number;
  height: number;
}

const images = new Map<string, DecodedImage>();

export function registerImage(assetId: string, image: DecodedImage): void {
  images.set(assetId, image);
}

export function getImage(assetId: string): DecodedImage | undefined {
  return images.get(assetId);
}

export function hasImage(assetId: string): boolean {
  return images.has(assetId);
}

/** Destination rectangle of an image in a box, for a fit mode. */
export function fitRect(
  iw: number,
  ih: number,
  box: { x: number; y: number; width: number; height: number },
  fit: "contain" | "cover" | "fill",
): { x: number; y: number; width: number; height: number } {
  if (fit === "fill" || iw <= 0 || ih <= 0) return box;
  const s = fit === "contain" ? Math.min(box.width / iw, box.height / ih) : Math.max(box.width / iw, box.height / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}
