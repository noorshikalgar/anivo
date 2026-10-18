import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The folder that contains assets/ (fonts, icons, templates) and prompts/.
 * In the repository it is the repository root. A bundled CLI sets
 * ANIVO_HOME to the folder of its bundle, where the build copies the files.
 */
export function anivoHome(): string {
  return process.env["ANIVO_HOME"] ?? fileURLToPath(new URL("../../../", import.meta.url));
}

/** A path inside the Anivo home folder, for example homePath("assets", "fonts"). */
export function homePath(...parts: string[]): string {
  return join(anivoHome(), ...parts);
}
