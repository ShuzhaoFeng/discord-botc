import type { RoleDefinition } from "../types";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "saint",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  deathHandler: {
    async onDeath({ state, deadPlayerId, byExecution }) {
      // Saint only triggers on execution, not night death
      if (!byExecution) return;

      // Confirm the dead player is this Saint instance
      const saintPs = state.runtime.playerStates.find(
        (ps) => ps.role.id === "saint" && ps.player.userId === deadPlayerId,
      );
      if (!saintPs) return;

      // Signal day.ts to end the game with the Saint loss condition.
      // day.ts reads and clears this after triggerDeathHandlers returns.
      state.runtime.pendingEndGame = { winner: "good_saint_fail" };
    },
  },
};
