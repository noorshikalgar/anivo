import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "./index.js";

describe("schema", () => {
  it("starts at version 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
