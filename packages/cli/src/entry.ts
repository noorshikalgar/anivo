// Entry of the bundled CLI. The bundle carries assets/ and prompts/ next to it.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.env["ANIVO_HOME"] ??= dirname(fileURLToPath(import.meta.url));
const { main } = await import("./main.js");
await main();
