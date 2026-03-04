/**
 * Sends role DMs to all players once the draft is confirmed,
 * then announces in the game channel that roles have been distributed.
 */

import { Client, TextChannel } from "discord.js";
import { GameState } from "../game/types";
import { getLang, getRoleName, t } from "../i18n";
import { renderRoleDm } from "../game/draft_render";
import { updateGame } from "../game/state";
import { sendPlayerDm } from "../utils/sendPlayerDm";
import { ensureRuntime, startNightPhase } from "../game/night";

export async function distributeRoles(
  client: Client,
  state: GameState,
): Promise<void> {
  const draft = state.draft!;

  for (const player of state.players) {
    const trueRole = draft.assignments.get(player.userId)!;
    const lang = getLang(player.userId);
    const isDrunk = trueRole.id === "drunk";

    // Determine what role to display to the player.
    // Drunk sees their fake Townsfolk role (not told they are Drunk).
    const displayRole =
      isDrunk && draft.drunkFakeRole ? draft.drunkFakeRole : trueRole;

    // Imp gets bluff roles and the list of minion players (with role names).
    const impBluffs =
      trueRole.id === "imp" ? (draft.impBluffs ?? undefined) : undefined;
    const impMinions =
      trueRole.id === "imp"
        ? state.players
            .filter(
              (p) => draft.assignments.get(p.userId)?.category === "Minion",
            )
            .map((p) => {
              const r = draft.assignments.get(p.userId)!;
              return `${p.displayName} (${getRoleName(lang, r.id)})`;
            })
        : undefined;

    // Minions learn who the Demon is and who their fellow Minions are.
    const isMinion = trueRole.category === "Minion";
    const minionDemon = isMinion
      ? (() => {
          const d = state.players.find(
            (p) => draft.assignments.get(p.userId)?.category === "Demon",
          );
          if (!d) return undefined;
          const r = draft.assignments.get(d.userId)!;
          return `${d.displayName} (${getRoleName(lang, r.id)})`;
        })()
      : undefined;
    const minionPeers = isMinion
      ? state.players
          .filter(
            (p) =>
              p.userId !== player.userId &&
              draft.assignments.get(p.userId)?.category === "Minion",
          )
          .map((p) => {
            const r = draft.assignments.get(p.userId)!;
            return `${p.displayName} (${getRoleName(lang, r.id)})`;
          })
      : undefined;

    const dmContent = renderRoleDm(
      state.gameId,
      displayRole,
      lang,
      impBluffs ?? undefined,
      impMinions ?? undefined,
      minionDemon,
      minionPeers,
    );

    try {
      await sendPlayerDm(client, player, state, dmContent);
    } catch {
      // If DM fails, post a notice in the game channel.
      const channel = (await client.channels.fetch(
        state.channelId,
      )) as TextChannel;
      const ref = player.isTestPlayer
        ? `**${player.displayName}** (test player)`
        : `<@${player.userId}>`;
      await channel.send(t(lang, "roleSenderDmFailed", { ref }));
    }
  }

  // Update phase.
  state.phase = "in_progress";
  ensureRuntime(state);
  updateGame(state);

  // Announce in game channel.
  try {
    const channel = (await client.channels.fetch(
      state.channelId,
    )) as TextChannel;
    // Use the lang of the first player as a fallback for the channel announcement.
    const channelLang = getLang(state.players[0]?.userId ?? "");
    await channel.send(t(channelLang, "rolesDistributed"));
  } catch {
    // Ignore channel errors.
  }

  await startNightPhase(client, state);
}
