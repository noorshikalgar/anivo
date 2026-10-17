import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScene } from "./load.js";
import { MIGRATIONS, migrate } from "./migrate.js";
import { SCHEMA_VERSION } from "./scene.js";

describe("migrations", () => {
  it("has a migration for each version below the current version", () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(MIGRATIONS[v], `migration ${v}`).toBeTypeOf("function");
  });

  it("opens each fixture file of each old version", () => {
    const dir = new URL("../fixtures/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const r = loadScene(JSON.parse(readFileSync(new URL(f, dir), "utf8")));
      expect(r.ok, f).toBe(true);
    }
  });

  it("applies migrations in sequence and checks the result version", () => {
    MIGRATIONS[90] = (s) => ({ ...s, schemaVersion: 91, a: 1 });
    MIGRATIONS[91] = (s) => ({ ...s, schemaVersion: 92, b: 2 });
    try {
      expect(migrate({ schemaVersion: 90 }, 92)).toEqual({ schemaVersion: 92, a: 1, b: 2 });
      MIGRATIONS[91] = (s) => ({ ...s, schemaVersion: 95 });
      expect(() => migrate({ schemaVersion: 90 }, 92)).toThrow(/must give version 92/);
      expect(() => migrate({ schemaVersion: 80 }, 92)).toThrow(/no migration from schema version 80/);
    } finally {
      delete MIGRATIONS[90];
      delete MIGRATIONS[91];
    }
  });
});
