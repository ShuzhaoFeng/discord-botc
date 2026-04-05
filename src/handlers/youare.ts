/**
 * Handles the /youare slash command.
 * The bot takes on the Storyteller role in Automated Mode.
 */

import { ChatInputCommandInteraction, Client } from 'discord.js';
import { getGame, updateGame } from '../game/state';
import { getLang, t } from '../i18n';
import { generateDraft } from '../game/assignment';
import { distributeRoles } from './role_sender';

export async function handleYouare(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const lang = getLang(interaction.user.id, interaction.guildId);
  const channelId = interaction.channelId;
  const state = getGame(channelId);

  if (!state) {
    await interaction.reply({ content: t(lang, 'errorNotGameChannel'), ephemeral: true });
    return;
  }

  if (state.mode !== 'pending') {
    await interaction.reply({ content: t(lang, 'errorAlreadyDecided'), ephemeral: true });
    return;
  }

  const total = state.players.length;

  // With 16 people, automated mode would need to handle 16 players — above max of 15.
  if (total === 16) {
    await interaction.reply({ content: t(lang, 'errorYouareNeedsFifteen'), ephemeral: true });
    return;
  }

  // Automated mode: no human storyteller, all players remain.
  state.storytellerId = null;
  state.mode = 'automated';
  state.phase = 'role_assignment';
  state.draft = generateDraft(state.players);

  updateGame(state);

  await interaction.reply(t(lang, 'youareAccepted'));

  // Immediately distribute roles.
  await distributeRoles(client, state);
}
