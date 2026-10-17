#!/usr/bin/env node
// Development launcher: runs the TypeScript source with tsx.
// A published package will ship a bundled build instead.
import { register } from "tsx/esm/api";

register();
const { main } = await import("../src/main.ts");
await main();
