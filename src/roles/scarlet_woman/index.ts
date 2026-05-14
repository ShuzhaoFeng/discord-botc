import type { RoleDefinition } from "../types";
import { getRole } from "../../game/utils";
import { useTranslation, getLang, t } from "../../i18n";
import { sendPlayerDM } from "../../utils/sendPlayerDM";
import { updateGame } from "../../game/state";
import { localize } from "../../utils/roleI18n";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const i18n = { en, zh };

export const definition: RoleDefinition = {
  id: "scarlet_woman",
  name: localize(i18n, "name"),
  guide: localize(i18n, "guide"),
  deathHandler: {
    async onDeath({ state, client, deadPlayerId }) {
      const runtime = state.runtime;

      const deadRole = getRole(runtime, deadPlayerId);
      if (deadRole.id !== "imp") return;

      const swPs = runtime.playerStates.find(
        (ps) => ps.alive && ps.role.id === "scarlet_woman",
      );
      if (!swPs) return;

      // Requires 5+ alive players (SW counts).
      const aliveCount = runtime.playerStates.filter((ps) => ps.alive).length;
      if (aliveCount < 5) return;

      swPs.role = deadRole;
      swPs.effectiveRole = deadRole;
      if (state.draft)
        state.draft.assignments.set(swPs.player.userId, deadRole);
      updateGame(state);

      const trSw = useTranslation(swPs.player.userId, state.guildId);
      await sendPlayerDM(
        client,
        swPs.player,
        state,
        trSw("dayScarletWomanBecomesImp"),
      );

      if (state.mode === "manual" && state.storytellerId) {
        try {
          const stUser = await client.users.fetch(state.storytellerId);
          const trSt = useTranslation(state.storytellerId, state.guildId);
          await stUser.send(
            trSt("dayScarletWomanStorytellerNotify", {
              player: swPs.player.displayName,
            }),
          );
        } catch {
          // Best-effort notification.
        }
      }
    },
  },
};
