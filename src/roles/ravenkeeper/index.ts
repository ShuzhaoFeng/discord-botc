import type { RoleDefinition } from "../types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "ravenkeeper",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  deathHandler: {
    async onDeath({ state, deadPlayerId, phase }) {
      // Ravenkeeper ability only triggers on night death
      if (phase !== "night") return;

      // Confirm the dead player is this Ravenkeeper
      const rkPs = state.runtime.playerStates.find(
        (ps) =>
          ps.role.id === "ravenkeeper" && ps.player.userId === deadPlayerId,
      );
      if (!rkPs) return;

      const session = state.runtime.nightSession;
      if (!session) return;

      // Mark this player as the ravenkeeper kind in the death narrative phase.
      // The actual prompt will be sent by resolveNightOutcomes as part of step-3 info messages.
      session.deathNarrativePlayers.set(deadPlayerId, "ravenkeeper");
    },
  },
};
