import { AnivoPlayer } from "./player.js";

export { AnivoPlayer, type PlayerBundle } from "./player.js";
export { sceneNeeds } from "./needs.js";

/** Define <anivo-player> one time. */
export function defineAnivoPlayer(name = "anivo-player"): void {
  if (!customElements.get(name)) customElements.define(name, AnivoPlayer);
}

defineAnivoPlayer();
