/**
 * Handles the /iam slash command.
 * The user volunteers to be the storyteller (Manual Mode).
 */

import { ChatInputCommandInteraction, Client } from 'discord.js';
import { getGame, updateGame, setStoryteller } from '../game/state';
import { getLang, t } from '../i18n';
import { generateDraft } from '../game/assignment';
import { renderDraft } from '../game/draft_render';

export async function handleIam(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const lang = getLang(interaction.user.id);
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

  // With exactly 5 people total and no storyteller yet, /iam would drop to 4 players.
  if (total === 5) {
    await interaction.reply({ content: t(lang, 'errorIamNeedsSix'), ephemeral: true });
    return;
  }

  // Designate the interactor as storyteller; remove from players list.
  const storytellerId = interaction.user.id;
  state.storytellerId = storytellerId;
  state.mode = 'manual';
  state.phase = 'role_assignment';
  state.players = state.players.filter(p => p.userId !== storytellerId);

  // Generate a random draft.
  state.draft = generateDraft(state.players);

  setStoryteller(storytellerId, channelId);
  updateGame(state);

  // Announce in game channel.
  await interaction.reply(
    t(lang, 'iamAccepted', interaction.user.username),
  );

  // Send draft DM to storyteller.
  try {
    const stUser = await client.users.fetch(storytellerId);
    const stLang = getLang(storytellerId);
    await stUser.send(renderDraft(state, stLang));
  } catch {
    await interaction.followUp({
      content: '⚠️ The whisper could not reach you. Please enable DMs from server members.',
      ephemeral: true,
    });
  }
}
