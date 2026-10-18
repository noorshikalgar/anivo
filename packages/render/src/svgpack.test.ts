import { describe, expect, it } from "vitest";
import { getIcon, registerIconPack } from "./icons.js";
import { iconFromSvg, iconName, iconPackFromSvgs } from "./svgpack.js";

const STROKE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><title>x</title><path d="M4 4L20 20"/><circle cx="12" cy="12" r="4"/><rect x="2" y="2" width="20" height="20" rx="3"/></svg>`;
const FILL = `<svg viewBox="0 0 48 48"><defs><clipPath id="c"><rect width="48" height="48"/></clipPath></defs><polygon points="0,0 48,0 24,48"/></svg>`;

describe("SVG icon packs", () => {
  it("reads shapes, the view box, and stroke or fill", () => {
    const s = iconFromSvg(STROKE)!;
    expect(s.d).toHaveLength(3);
    expect(s).toMatchObject({ viewBox: [0, 0, 24, 24], stroke: true, strokeWidth: 1.5 });
    const f = iconFromSvg(FILL)!;
    expect(f).toMatchObject({ d: ["M0 0L48 0L24 48Z"], viewBox: [0, 0, 48, 48], stroke: false });
    expect(iconFromSvg("<svg></svg>")).toBeNull();
  });

  it("makes a pack with valid names and per-icon view boxes", () => {
    const { pack, skipped } = iconPackFromSvgs("My Brand", [
      { name: "Cloud Server.svg", svg: STROKE },
      { name: "db_main.svg", svg: STROKE },
      { name: "Arrow.svg", svg: FILL },
      { name: "empty.svg", svg: "<svg/>" },
    ]);
    expect(pack).toMatchObject({ pack: "my-brand", kind: "stroke", viewBox: [0, 0, 24, 24], strokeWidth: 1.5 });
    expect(Object.keys(pack.icons)).toEqual(["arrow", "cloud-server", "db-main"]);
    expect(pack.icons["arrow"]!.viewBox).toEqual([0, 0, 48, 48]);
    expect(skipped).toEqual(["empty.svg"]);
    registerIconPack(pack);
    expect(getIcon("my-brand", "arrow")!.viewBox).toEqual([0, 0, 48, 48]);
    expect(getIcon("my-brand", "cloud-server")!.strokes.length).toBeGreaterThan(0);
    expect(iconName("Hello World!.SVG")).toBe("hello-world");
  });
});
