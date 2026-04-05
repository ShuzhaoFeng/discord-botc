import type { RoleDefinition } from "../types";
import { getRole } from "../../game/utils";
import { getLang, t } from "../../i18n";
import { sendPlayerDm } from "../../utils/sendPlayerDm";
import { updateGame } from "../../game/state";
import { TextChannel } from "discord.js";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export const definition: RoleDefinition = {
  id: "scarlet_woman",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  deathHandler: {
    async onDeath({ state, client, deadPlayerId }) {
      const runtime = state.runtime;

      // Only triggered when the Imp dies
      const deadRole = getRole(runtime, deadPlayerId);
      if (deadRole.id !== "imp") return;

      // Find an alive Scarlet Woman
      const swPs = runtime.playerStates.find(
        (ps) => ps.alive && ps.role.id === "scarlet_woman",
      );
      if (!swPs) return;

      // Requires 5+ alive players (SW counts)
      const aliveCount = runtime.playerStates.filter((ps) => ps.alive).length;
      if (aliveCount < 5) return;

      // SW becomes the Imp
      swPs.role = deadRole;
      swPs.effectiveRole = deadRole;
      if (state.draft)
        state.draft.assignments.set(swPs.player.userId, deadRole);
      updateGame(state);

      // Notify SW via DM
      const swLang = getLang(swPs.player.userId, state.guildId);
      await sendPlayerDm(
        client,
        swPs.player,
        state,
        t(swLang, "dayScarletWomanBecomesImp"),
      );

      // Notify storyteller if manual mode
      if (state.mode === "manual" && state.storytellerId) {
        try {
          const stUser = await client.users.fetch(state.storytellerId);
          const stLang = getLang(state.storytellerId, state.guildId);
          await stUser.send(
            t(stLang, "dayScarletWomanStorytellerNotify", {
              player: swPs.player.displayName,
            }),
          );
        } catch {
          // Ignore DM failure
        }
      }

      // Announce in the game channel
      const channel = (await client.channels.fetch(
        state.channelId,
      )) as TextChannel;
      const channelLang = getLang(
        state.players[0]?.userId ?? "",
        state.guildId,
      );
      await channel.send(t(channelLang, "dayScarletWomanChannelNotify"));
    },
  },
};
