/**
 * Scene file migrations (docs/05 "Schema versions and migrations").
 *
 * 1. Each breaking change to the format increases SCHEMA_VERSION by 1.
 * 2. Add a pure function MIGRATIONS[N] that converts a version N file to version N + 1.
 * 3. Add a fixture file for version N in packages/schema/fixtures/.
 *
 * WARNING: Do not remove or change a migration. Old files must always open.
 */
export type RawScene = Record<string, unknown> & { schemaVersion: number };

export const MIGRATIONS: Record<number, (scene: RawScene) => RawScene> = {
  // 1: (scene) => ({ ...scene, schemaVersion: 2, ... }),
};

/** Apply migrations in sequence until `target`. A newer file stays unchanged. */
export function migrate(scene: RawScene, target: number): RawScene {
  let cur = scene;
  while (cur.schemaVersion < target) {
    const step = MIGRATIONS[cur.schemaVersion];
    if (!step) throw new Error(`There is no migration from schema version ${cur.schemaVersion}. Update Anivo.`);
    const next = step(cur);
    if (next.schemaVersion !== cur.schemaVersion + 1) throw new Error(`The migration from version ${cur.schemaVersion} must give version ${cur.schemaVersion + 1}.`);
    cur = next;
  }
  return cur;
}
