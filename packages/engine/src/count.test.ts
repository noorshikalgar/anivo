import { describe, expect, it } from "vitest";
import { formatCount } from "./evaluate.js";

describe("formatCount (docs/21 C9)", () => {
  it("writes plain, thousands, short, and time numbers", () => {
    expect(formatCount(12400.4, 0, undefined)).toBe("12400");
    expect(formatCount(1234567.891, 2, "thousands")).toBe("1,234,567.89");
    expect(formatCount(-9876, 0, "thousands")).toBe("-9,876");
    expect(formatCount(12400, 0, "compact")).toBe("12.4K");
    expect(formatCount(3_000_000, 0, "compact")).toBe("3M");
    expect(formatCount(950, 0, "compact")).toBe("950");
    expect(formatCount(65, 0, "duration")).toBe("1:05");
    expect(formatCount(3725.9, 0, "duration")).toBe("1:02:05");
  });
});
