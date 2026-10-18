/**
 * Share links with end-to-end encryption (FR-SHARE-01).
 * The scene (with its assets) is encrypted in the browser with AES-GCM. The server
 * gets only the encrypted bytes. The key is in the URL fragment (#share=id.key),
 * which browsers do not send to servers.
 */
import { packArchive, unpack } from "@anivo/fileio";
import { openAsNew } from "./files.js";
import { useEditor } from "./store.js";

/** The share server from the runtime configuration (ANIVO_SERVER_URL), or "". */
export function shareServer(): string {
  const c = (window as unknown as { ANIVO_CONFIG?: { serverUrl?: string } }).ANIVO_CONFIG;
  return (c?.serverUrl ?? "").replace(/\/+$/, "");
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Format version of the encrypted bytes: [1][12-byte IV][ciphertext]. */
const VERSION = 1;

export async function createShareLink(): Promise<string> {
  const server = shareServer();
  if (!server) throw new Error("This Anivo has no share server. Set ANIVO_SERVER_URL (docs/11).");
  const { scene, assets } = useEditor.getState();
  const plain = packArchive(scene, assets);
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain as BufferSource));
  const body = new Uint8Array(1 + iv.length + cipher.length);
  body[0] = VERSION;
  body.set(iv, 1);
  body.set(cipher, 13);
  const res = await fetch(`${server}/api/shares`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body });
  if (!res.ok) throw new Error(`The share server answered HTTP ${res.status}: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? ""}`.trim());
  const { id } = (await res.json()) as { id: string };
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return `${location.origin}${location.pathname}#share=${id}.${b64url(raw)}`;
}

/** If the page URL has a share fragment, open that scene. Returns true if it opened one. */
export async function openShareFromUrl(): Promise<boolean> {
  const m = /^#share=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (!m) return false;
  // Remove the key from the address bar and the history.
  history.replaceState(null, "", location.pathname + location.search);
  const server = shareServer();
  if (!server) throw new Error("This Anivo has no share server, so it cannot open the share link.");
  const res = await fetch(`${server}/api/shares/${m[1]}`);
  if (!res.ok) throw new Error(res.status === 404 ? "The shared scene does not exist or expired." : `The share server answered HTTP ${res.status}.`);
  const data = new Uint8Array(await res.arrayBuffer());
  if (data[0] !== VERSION) throw new Error("The shared scene has an unknown format.");
  const key = await crypto.subtle.importKey("raw", fromB64url(m[2]!) as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.subarray(1, 13) }, key, data.subarray(13)));
  } catch {
    throw new Error("The link key does not open this scene. Check that you copied the full link.");
  }
  const r = unpack(plain);
  if (!r.ok) throw new Error(`The shared scene is not valid. ${r.issues[0]?.message ?? ""}`);
  openAsNew(r.scene, r.assets);
  return true;
}
