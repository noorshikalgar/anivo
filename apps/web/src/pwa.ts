/**
 * The installed app (PWA, docs/11): the service worker for offline use,
 * .anivo files that the system opens with Anivo, the install button, and
 * the notice when a new version is ready.
 */
import { newScene, openHandle } from "./files.js";
import { notify, withErrors } from "./notify.js";
import { useEditor } from "./store.js";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installPrompt: InstallPrompt | null = null;

/** True when the app runs as an installed app, in its own window. */
export function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function setupPwa(): void {
  // Offline: the service worker (production builds only; the dev server changes files all the time).
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register("./sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        next?.addEventListener("statechange", () => {
          // A new version is ready. Do not reload by surprise: the user can have unsaved work.
          if (next.state === "installed" && navigator.serviceWorker.controller) useEditor.setState({ updateReady: true });
        });
      });
    });
  }
  // Files that the system opens with the installed app.
  const lq = (window as unknown as { launchQueue?: { setConsumer(f: (p: { files?: unknown[] }) => void): void } }).launchQueue;
  lq?.setConsumer((params) => {
    const h = params.files?.[0] as Parameters<typeof openHandle>[0] | undefined;
    if (h) void withErrors(() => openHandle(h));
  });
  // The install button.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    useEditor.setState({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    useEditor.setState({ canInstall: false });
    notify("Anivo is installed. Open it from your apps, or open .anivo files with it.", "success");
  });
  // The "New scene" shortcut of the installed app.
  if (new URLSearchParams(location.search).get("new") === "1") newScene();
}

/** Show the browser install dialog. */
export async function installApp(): Promise<void> {
  if (!installPrompt) return;
  await installPrompt.prompt();
  const r = await installPrompt.userChoice;
  if (r.outcome === "accepted") useEditor.setState({ canInstall: false });
  installPrompt = null;
}

/** Use the new version: the waiting service worker takes over, then the page reloads. */
export async function applyUpdate(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.waiting?.postMessage("skip-waiting");
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
}
