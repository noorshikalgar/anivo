import { hasImage, registerImage } from "@anivo/render";
import type { Scene } from "@anivo/schema";

/** Decode one image file in the browser. SVG files use an <img> element when createImageBitmap cannot read them. */
export async function decodeImage(bytes: Uint8Array, mime: string): Promise<ImageBitmap | HTMLImageElement | null> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  try {
    return await createImageBitmap(blob);
  } catch {
    if (typeof Image === "undefined") return null;
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img.naturalWidth > 0 ? img : null;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Decode the image assets of a scene and register them for the renderer.
 * Returns true if a new image was registered.
 */
export async function decodeSceneImages(scene: Scene, assets: Map<string, Uint8Array> | undefined): Promise<boolean> {
  if (!assets) return false;
  let added = false;
  for (const el of Object.values(scene.elements)) {
    if (el.type !== "image" || hasImage(el.assetId)) continue;
    const bytes = assets.get(el.assetId);
    const mime = scene.assets[el.assetId]?.mime;
    if (!bytes || !mime) continue;
    const img = await decodeImage(bytes, mime);
    if (!img || hasImage(el.assetId)) continue;
    // An <img> that is not in the page has width and height equal to its natural size.
    registerImage(el.assetId, img);
    added = true;
  }
  return added;
}
