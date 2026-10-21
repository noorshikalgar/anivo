/**
 * The service worker of the installed app (PWA). The build makes sw.js with
 * the list of the built files, so the app shell works offline. Large files
 * that load on demand (speech models) are cached the first time they load.
 */
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

/** Files that load on demand: do not download them at install. */
const ON_DEMAND = /ort-wasm|worker-|\.map$/;

/** Files from the public folder that the app needs at start. */
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./config.js"];

/** Folders of the public folder that the app loads at start (fonts, icon packs, templates, app icons). */
const PUBLIC_DIRS = ["fonts", "icons", "templates", "app"];

function publicFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (!name.startsWith(".")) out.push(`./${relative(root, p).split("\\").join("/")}`);
    }
  };
  for (const d of PUBLIC_DIRS) {
    try {
      walk(join(root, d));
    } catch {
      // The folder is not there: nothing to cache.
    }
  }
  return out;
}

export function serviceWorker(publicDir: string): Plugin {
  return {
    name: "anivo-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !ON_DEMAND.test(f) && f !== "index.html");
      const precache = [...new Set([...SHELL, ...publicFiles(publicDir), ...built.map((f) => `./${f}`)])];
      const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
      this.emitFile({ type: "asset", fileName: "sw.js", source: source(version, precache) });
    },
  };
}

function source(version: string, precache: string[]): string {
  return `// Anivo service worker ${version}. Made by the build (apps/web/sw-plugin.ts).
const SHELL = "anivo-shell-${version}";
const RUNTIME = "anivo-runtime";
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("anivo-shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only this site, only GET. The share server and agent bridge (/api) always go to the network.
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;
  if (req.mode === "navigate") {
    // Pages: the network first, so a new version shows; the cached app when offline.
    e.respondWith(fetch(req).catch(() => caches.match("./index.html", { ignoreSearch: true })));
    return;
  }
  // Files: the cache first; else the network, and keep a copy for next time.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
}
