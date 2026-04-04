import type { RoleDefinition } from "../types";
import { getLang, t } from "../../i18n";
import { sendPlayerDm } from "../../utils/sendPlayerDm";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "ravenkeeper",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  deathHandler: {
    async onDeath({ state, client, deadPlayerId, phase }) {
      // Ravenkeeper ability only triggers on night death
      if (phase !== "night") return;

      // Confirm the dead player is this Ravenkeeper
      const rkPs = state.runtime.playerStates.find(
        (ps) => ps.role.id === "ravenkeeper" && ps.player.userId === deadPlayerId,
      );
      if (!rkPs) return;

      const session = state.runtime.nightSession;
      if (!session) return;

      // Mark that we are waiting for the Ravenkeeper's player pick
      session.pendingRavenkeeperPick = deadPlayerId;

      // Prompt the Ravenkeeper via DM
      const lang = getLang(deadPlayerId);
      await sendPlayerDm(
        client,
        rkPs.player,
        state,
        t(lang, "nightRavenkeeperPickPrompt"),
      );
    },
  },
};
