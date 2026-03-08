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
  /**
   * Override the user that receives the draft DM and is registered as the
   * storyteller for DM routing.  Used in test-mode impersonation, where the
   * fake player's synthetic ID cannot receive DMs; pass the test owner's ID
   * instead so DMs arrive at a real Discord account.
   */
  dmRecipientId?: string,
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

  const dmTarget = dmRecipientId ?? storytellerId;
  setStoryteller(dmTarget, channelId);
  updateGame(state);

  // Announce in game channel.
  await interaction.reply(
    t(lang, 'iamAccepted', { username: interaction.user.username }),
  );

  // Send draft DM to storyteller (or dmRecipientId override in test mode).
  try {
    const stUser = await client.users.fetch(dmTarget);
    const stLang = getLang(dmTarget);
    await stUser.send(renderDraft(state, stLang));
  } catch {
    await interaction.followUp({
      content: t(lang, 'iamDmFailed'),
      ephemeral: true,
    });
  }
}
