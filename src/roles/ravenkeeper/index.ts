import type { RoleDefinition } from "../types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "ravenkeeper",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  deathHandler: {
    async onDeath({ state, deadPlayerId, phase }) {
      if (phase !== "night") return;

      // Match on effectiveRole so a Drunk who thinks they are the Ravenkeeper
      // also gets the prompt (with a randomized role result, per BotC rules).
      const rkPs = state.runtime.playerStates.find(
        (ps) =>
          ps.effectiveRole.id === "ravenkeeper" &&
          ps.player.userId === deadPlayerId,
      );
      if (!rkPs) return;

      const session = state.runtime.nightSession;
      if (!session) return;

      // The actual prompt is sent later by setupDeathNarratives.
      session.deathNarrativePlayers.set(deadPlayerId, "ravenkeeper");
    },
  },
};
