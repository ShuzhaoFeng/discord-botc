/**
 * Handles the /iam slash command.
 * The user volunteers to be the storyteller (Manual Mode).
 */

import { ChatInputCommandInteraction, Client } from "discord.js";
import { getGame, updateGame, setStoryteller } from "../game/state";
import { useTranslation, getGuildDrunkOverlap } from "../i18n";
import { generateDraft } from "../game/assignment";

export async function handleIam(
  interaction: ChatInputCommandInteraction,
  client: Client,
  /**
   * Override the user ID used for storyteller DM routing.
   * Used in test-mode impersonation, where the fake player's synthetic ID
   * cannot receive DMs; pass the test owner's real ID instead.
   */
  storytellerRoutingId?: string,
): Promise<void> {
  void client;
  const tr = useTranslation(interaction.user.id, interaction.guildId);
  const channelId = interaction.channelId;
  const state = getGame(channelId);

  if (!state) {
    await interaction.reply({
      content: tr("errorNotGameChannel"),
      ephemeral: true,
    });
    return;
  }

  if (state.mode !== "pending") {
    await interaction.reply({
      content: tr("errorAlreadyDecided"),
      ephemeral: true,
    });
    return;
  }

  const total = state.players.length;

  // With exactly 5 people total and no storyteller yet, /iam would drop to 4 players.
  if (total === 5) {
    await interaction.reply({
      content: tr("errorIamNeedsSix"),
      ephemeral: true,
    });
    return;
  }

  // Designate the interactor as storyteller; remove from players list.
  const storytellerId = interaction.user.id;
  state.storytellerId = storytellerId;
  state.mode = "manual";
  state.phase = "role_assignment";
  state.players = state.players
    .filter((p) => p.userId !== storytellerId)
    .map((p, i) => ({ ...p, seatIndex: i }));

  // Generate a random draft.
  state.draft = generateDraft(
    state.players,
    getGuildDrunkOverlap(state.guildId),
  );

  const routingId = storytellerRoutingId ?? storytellerId;
  setStoryteller(routingId, channelId);
  updateGame(state);

  await interaction.reply(
    tr("iamAccepted", { username: interaction.user.username }),
  );
}
