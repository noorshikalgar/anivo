import { describe, expect, it } from "vitest";
import { staggerRanks } from "./timeline.js";

describe("staggerRanks (docs/21 C6)", () => {
  it("keeps the order by default and reverses it", () => {
    expect(staggerRanks(4, undefined, "a")).toEqual([0, 1, 2, 3]);
    expect(staggerRanks(4, "reverse", "a")).toEqual([3, 2, 1, 0]);
  });
  it("starts from the center or from the edges", () => {
    expect(staggerRanks(5, "center", "a")).toEqual([2, 1, 0, 1, 2]);
    expect(staggerRanks(5, "edges", "a")).toEqual([0, 1, 2, 1, 0]);
    expect(staggerRanks(4, "center", "a")).toEqual([1, 0, 0, 1]);
  });
  it("shuffles the same way each time", () => {
    const r = staggerRanks(8, "random", "act-1");
    expect([...r].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(staggerRanks(8, "random", "act-1")).toEqual(r);
    expect(r).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
