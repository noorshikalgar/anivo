import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { registerIconPack } from "@anivo/render";
import { loadScene } from "@anivo/schema";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { playerHtml, usedIcons } from "./html.js";
import { sceneNeeds } from "./needs.js";

const fixture = JSON.parse(readFileSync(new URL("../../schema/fixtures/v1-load-balancer.json", import.meta.url), "utf8"));
const r = loadScene(fixture);
if (!r.ok) throw new Error("fixture");
const scene = r.scene;

describe("player bundle", () => {
  it("is less than 150 KB gzip without fonts (FR-PLAY-02)", async () => {
    const out = await build({ entryPoints: [new URL("./index.ts", import.meta.url).pathname], bundle: true, minify: true, format: "esm", platform: "browser", write: false, legalComments: "none" });
    const gz = gzipSync(out.outputFiles[0]!.contents, { level: 9 }).length;
    expect(gz).toBeLessThan(150 * 1024);
  }, 60_000);
});

describe("HTML player file", () => {
  registerIconPack({ pack: "lucide", license: "ISC", kind: "stroke", viewBox: [0, 0, 24, 24], strokeWidth: 2, icons: { user: { d: ["M1 1L2 2"], tags: ["person"] }, server: { d: ["M0 0"], tags: [] } } });

  it("knows the fonts and icon packs that a scene needs", () => {
    expect(sceneNeeds(scene)).toEqual({ fonts: ["Inter"], packs: ["lucide"] });
    expect(sceneNeeds({ ...scene, settings: { ...scene.settings, style: "sketch" } }).fonts).toEqual(["Inter", "Kalam"]);
  });

  it("embeds only the used icons and fonts, and escapes the data", () => {
    const icons = usedIcons(scene);
    expect(Object.keys(icons[0]!.icons)).toEqual(["user"]);
    const tricky = { ...scene, meta: { ...scene.meta, title: "A </script><b>title</b>" } };
    const html = playerHtml(tricky, {
      playerJs: "console.log('</script>')",
      fonts: [
        { family: "Inter", weight: "400", bytes: new Uint8Array([1, 2, 3]) },
        { family: "Kalam", weight: "400", bytes: new Uint8Array([4]) },
      ],
      captions: "bottom",
      loop: true,
    });
    expect(html).toContain("<title>A &lt;/script&gt;&lt;b&gt;title&lt;/b&gt;</title>");
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).toContain("<anivo-player controls loop>");
    const json = /<script type="application\/json">(.*?)<\/script>/s.exec(html)![1]!;
    const data = JSON.parse(json) as { fonts: { family: string }[]; captions: string; scene: { meta: { title: string } } };
    expect(data.fonts.map((f) => f.family)).toEqual(["Inter"]);
    expect(data.captions).toBe("bottom");
    expect(data.scene.meta.title).toBe("A </script><b>title</b>");
  });
});
