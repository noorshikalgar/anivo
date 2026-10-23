/**
 * Custom fonts (docs/20 B10): add a font file to the scene, and load the
 * fonts of the scene into the browser, so the canvas can draw them.
 */
import { assetId } from "@anivo/fileio";
import { notify } from "./notify.js";
import { useEditor } from "./store.js";

const loaded = new Set<string>();

/** Load the fonts of the scene that the browser does not have yet. Redraws when one loads. */
export async function loadSceneFonts(): Promise<void> {
  const st = useEditor.getState();
  for (const f of st.scene.settings.fonts ?? []) {
    const key = `${f.family}/${f.assetId}`;
    const bytes = st.assets.get(f.assetId);
    if (loaded.has(key) || !bytes) continue;
    loaded.add(key);
    try {
      const face = new FontFace(f.family, bytes as unknown as ArrayBuffer);
      await face.load();
      document.fonts.add(face);
      useEditor.setState((s) => ({ imagesVersion: s.imagesVersion + 1 }));
    } catch {
      notify(`The font '${f.family}' did not load. Use a woff2, woff, ttf, or otf file.`, "error");
    }
  }
}

const MIME: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };

/** Pick a font file and add it to the scene. Returns its family name. */
export async function addFontFile(): Promise<string | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".woff2,.woff,.ttf,.otf";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) {
    notify("Use a woff2, woff, ttf, or otf font file.", "error");
    return null;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = assetId(bytes);
  const family = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Custom font";
  const st = useEditor.getState();
  useEditor.setState({ assets: new Map(st.assets).set(id, bytes) });
  const fonts = [...(st.scene.settings.fonts ?? []).filter((f) => f.family !== family), { family, assetId: id }];
  const r = st.apply({
    label: `Add the font ${family}`,
    ops: [...(id in st.scene.assets ? [] : [{ op: "asset.add" as const, asset: { id, mime, bytes: bytes.length, name: file.name } }]), { op: "scene.settings" as const, set: { fonts } }],
  });
  if (!r.ok) {
    notify(r.error.message, "error");
    return null;
  }
  await loadSceneFonts();
  return family;
}
