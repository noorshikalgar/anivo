import { readFileSync } from "node:fs";
import { polyline } from "@anivo/layout";
import { describe, expect, it } from "vitest";
import { type IconPack, getIcon, registerIconPack, searchIcons } from "./icons.js";
import { flattenSvgPath } from "./svgpath.js";

const length = (d: string) => flattenSvgPath(d, 64).reduce((s, sp) => s + polyline(sp.points).length, 0);

describe("flattenSvgPath", () => {
  it("draws lines with absolute and relative commands", () => {
    expect(length("M0 0L10 0")).toBeCloseTo(10, 6);
    expect(length("m0 0l10 0 0 10")).toBeCloseTo(20, 6);
    expect(length("M0 0H10V10h-10z")).toBeCloseTo(40, 6);
  });

  it("makes a circle from two arcs with the correct length", () => {
    expect(length("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z")).toBeCloseTo(2 * Math.PI * 10, 0);
  });

  it("supports cubic, smooth cubic, quadratic, and smooth quadratic curves", () => {
    const sp = flattenSvgPath("M0 0C0 10 10 10 10 0S20 -10 20 0Q25 5 30 0T40 0");
    expect(sp).toHaveLength(1);
    const last = sp[0]!.points[sp[0]!.points.length - 1]!;
    expect(last.x).toBeCloseTo(40, 6);
    expect(last.y).toBeCloseTo(0, 6);
  });

  it("splits subpaths and marks closed subpaths", () => {
    const sp = flattenSvgPath("M0 0h5v5zM10 10h5");
    expect(sp.map((s) => s.closed)).toEqual([true, false]);
  });

  it("parses arc flags with no separators", () => {
    const sp = flattenSvgPath("M0 0a1 1 0 011 1");
    const last = sp[0]!.points[sp[0]!.points.length - 1]!;
    expect(last.x).toBeCloseTo(1, 6);
    expect(last.y).toBeCloseTo(1, 6);
  });

  it("parses numbers with no separators", () => {
    const sp = flattenSvgPath("M9.25 6a.75.75 0 0 0 0 1.5h5.5");
    expect(sp[0]!.points[sp[0]!.points.length - 1]!.x).toBeCloseTo(14.75, 6);
  });
});

describe("icon packs", () => {
  const load = (name: string) => JSON.parse(readFileSync(new URL(`../../../assets/icons/${name}.json`, import.meta.url), "utf8")) as IconPack;

  it("parses every icon in the bundled packs", () => {
    for (const name of ["lucide", "fluent"]) {
      const pack = load(name);
      registerIconPack(pack);
      for (const icon of Object.keys(pack.icons)) {
        const shape = getIcon(name, icon);
        expect(shape?.totalLength, `${name}:${icon}`).toBeGreaterThan(0);
      }
    }
  });

  it("finds icons by name and tag", () => {
    registerIconPack(load("lucide"));
    registerIconPack(load("fluent"));
    expect(searchIcons("server", { pack: "lucide" })[0]).toEqual({ pack: "lucide", name: "server" });
    expect(searchIcons("database").length).toBeGreaterThan(2);
    expect(searchIcons("person", { pack: "fluent", limit: 3 })).toHaveLength(3);
  });

  it("returns undefined for an unknown icon", () => {
    expect(getIcon("lucide", "no-such-icon")).toBeUndefined();
    expect(getIcon("nopack", "server")).toBeUndefined();
  });
});
