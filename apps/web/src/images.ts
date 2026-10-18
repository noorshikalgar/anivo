/**
 * Image elements in the editor (FR-CANVAS-13): insert a file, and decode the
 * image assets so the renderer can draw them.
 */
import { decodeImage, decodeSceneImages } from "@anivo/export-web";
import { assetId } from "@anivo/fileio";
import { useEditor } from "./store.js";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
const MAX_BYTES = 20 * 1024 * 1024;
/** A new image is at most this wide or high, in scene pixels. */
const MAX_SIDE = 480;

export class ImageError extends Error {}

export function imageMime(name: string, type: string): string {
  if (/^image\/(png|jpeg|webp|svg\+xml)$/.test(type)) return type;
  const mime = MIME[name.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime) throw new ImageError(`The file '${name}' has a type that Anivo does not read. Use a PNG, JPEG, WebP, or SVG file.`);
  return mime;
}

/** Add an image to the scene, centered at a scene point (default: the center of the view). Returns the element ID. */
export async function insertImage(bytes: Uint8Array, name: string, type: string, at?: { x: number; y: number }): Promise<string> {
  const mime = imageMime(name, type);
  if (bytes.length > MAX_BYTES) throw new ImageError(`The image '${name}' is larger than 20 MB. Use a smaller file.`);
  const img = await decodeImage(bytes, mime);
  if (!img) throw new ImageError(`The file '${name}' is not a valid image, or this browser cannot read it.`);
  const iw = img instanceof ImageBitmap ? img.width : img.naturalWidth;
  const ih = img instanceof ImageBitmap ? img.height : img.naturalHeight;
  const s = Math.min(1, MAX_SIDE / Math.max(iw, ih));
  const width = Math.round(iw * s);
  const height = Math.round(ih * s);
  const st = useEditor.getState();
  const c = at ?? { x: st.view.x + st.viewport.width / st.view.zoom / 2, y: st.view.y + st.viewport.height / st.view.zoom / 2 };
  const id = assetId(bytes);
  useEditor.setState({ assets: new Map(st.assets).set(id, bytes) });
  const r = st.apply({
    label: "Insert image",
    ops: [
      ...(id in st.scene.assets ? [] : [{ op: "asset.add" as const, asset: { id, mime, bytes: bytes.length, name } }]),
      { op: "element.add", type: "image", props: { assetId: id, x: Math.round(c.x - width / 2), y: Math.round(c.y - height / 2), width, height } },
    ],
  });
  if (!r.ok) throw new ImageError(r.error.message);
  const elId = r.created[0]!;
  st.setSelection([elId]);
  st.setTool("select");
  return elId;
}

/** Ask the user for an image file and insert it. */
export async function pickImage(): Promise<boolean> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/svg+xml,.svg";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return false;
  await insertImage(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
  return true;
}

/** Decode new image assets when the scene or the assets change, then redraw. */
export function startImageSync(): () => void {
  const sync = () => {
    const { scene, assets } = useEditor.getState();
    void decodeSceneImages(scene, assets).then((added) => added && useEditor.setState((s) => ({ imagesVersion: s.imagesVersion + 1 })));
  };
  sync();
  return useEditor.subscribe((s, prev) => {
    if (s.scene.elements !== prev.scene.elements || s.assets !== prev.assets) sync();
  });
}
