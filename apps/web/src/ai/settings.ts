import { idbGet, idbSet } from "../idb.js";
import { type AiSettings, DEFAULTS } from "./types.js";

const KEY = "aiSettings";

/** AI settings, kept in this browser only (IndexedDB). Never in a scene file, a log, or a link. */
export async function loadAiSettings(): Promise<AiSettings> {
  const s = await idbGet<AiSettings>(KEY).catch(() => undefined);
  return s ?? { provider: "anthropic", model: DEFAULTS.anthropic.model, baseUrl: DEFAULTS.anthropic.baseUrl, apiKey: "" };
}

export async function saveAiSettings(s: AiSettings): Promise<void> {
  await idbSet(KEY, s);
}
