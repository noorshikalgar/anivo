import { hasImage, registerImage } from "@anivo/render";
import type { Scene } from "@anivo/schema";
import { GlobalFonts, Image } from "@napi-rs/canvas";

const fontsDone = new Set<string>();

/**
 * Decode the image assets of a scene and register them for the renderer, and
 * register the custom fonts of the scene.
 * An asset with no bytes, or with bytes that do not decode, draws as a placeholder.
 */
export function registerSceneImages(scene: Scene, assets: Map<string, Uint8Array> | undefined): void {
  if (!assets) return;
  // Custom fonts of the scene (docs/20 B10).
  for (const f of scene.settings.fonts ?? []) {
    const bytes = assets.get(f.assetId);
    if (bytes && !fontsDone.has(`${f.family}/${f.assetId}`)) {
      GlobalFonts.register(Buffer.from(bytes), f.family);
      fontsDone.add(`${f.family}/${f.assetId}`);
    }
  }
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "image" || hasImage(el.assetId)) continue;
    const bytes = assets.get(el.assetId);
    if (!bytes) continue;
    const img = new Image();
    try {
      img.src = Buffer.from(bytes);
    } catch {
      continue;
    }
    if (img.width > 0 && img.height > 0) registerImage(el.assetId, img);
  }
}

/** Size of an image file in pixels, or null if it does not decode. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const img = new Image();
  try {
    img.src = Buffer.from(bytes);
  } catch {
    return null;
  }
  return img.width > 0 && img.height > 0 ? { width: img.width, height: img.height } : null;
}
