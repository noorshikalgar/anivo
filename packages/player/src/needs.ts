import type { Scene } from "@anivo/schema";

/** Font families and icon packs that a scene needs. */
export function sceneNeeds(scene: Scene): { fonts: string[]; packs: string[] } {
  const fonts = new Set(["Inter"]);
  if (scene.settings.style === "sketch") fonts.add("Kalam");
  const packs = new Set<string>();
  for (const el of Object.values(scene.elements)) {
    if (el.type === "code") fonts.add("JetBrains Mono");
    if (el.type === "icon") packs.add(el.pack);
  }
  return { fonts: [...fonts], packs: [...packs] };
}
