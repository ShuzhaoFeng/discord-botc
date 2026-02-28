/**
 * Handles the !as <player> <command...> message command for test-mode impersonation.
 *
 * The test owner can act on behalf of fake players in the game channel.
 * The bot silently ignores the command if not in a test game or not sent by
 * the test owner — !as is invisible to normal players.
 *
 * Supported sub-commands:
 *   !as <player> iam     — fake player claims the Storyteller role (Manual Mode)
 *   !as <player> youare  — fake player triggers Automated Mode
 *
 * Future sub-commands (not yet handled):
 *   !as <player> <anything else>  — bot replies that it's not supported yet
 */

import { Client, Message, TextChannel } from 'discord.js';
import { getGame, updateGame, setStoryteller } from '../game/state';
import { getLang, t } from '../i18n';
import { generateDraft } from '../game/assignment';
import { renderDraft } from '../game/draft_render';
import { distributeRoles } from './role_sender';
import { Player } from '../game/types';

const COMMAND_PREFIX = '!as ';

export function isImpersonateCommand(content: string): boolean {
  return content.trim().toLowerCase().startsWith(COMMAND_PREFIX);
}

export async function handleImpersonate(message: Message, client: Client): Promise<void> {
  if (!message.guild) return;

  const channelId = message.channelId;
  const state = getGame(channelId);

  // Silent bail-out: not a test game, or not the test owner.
  if (!state || !state.testMode || state.testOwnerId !== message.author.id) return;

  // Parse: !as <playerName> <rest...>
  const raw = message.content.trim().slice(COMMAND_PREFIX.length).trim();
  const tokens = raw.split(/\s+/);
  const playerName = tokens[0];
  const rest = tokens.slice(1);

  if (!playerName || rest.length === 0) {
    await message.reply('❌ Usage: `!as <player> <command>`');
    return;
  }

  // Resolve to a fake player in this game.
  const fakePlayer = resolveFakePlayer(playerName, state.players);
  if (!fakePlayer) {
    await message.reply(`❌ No fake player named "${playerName}" in this game.`);
    return;
  }

  const subCmd = rest[0].toLowerCase();
  const lang = getLang(message.author.id);

  switch (subCmd) {
    case 'iam': {
      if (state.mode !== 'pending') {
        await message.reply(t(lang, 'errorAlreadyDecided'));
        return;
      }
      if (state.players.length === 5) {
        await message.reply(t(lang, 'errorIamNeedsSix'));
        return;
      }

      // Appoint fake player as storyteller.
      state.storytellerId = fakePlayer.userId;
      state.mode = 'manual';
      state.phase = 'role_assignment';
      state.players = state.players.filter(p => p.userId !== fakePlayer.userId);
      state.draft = generateDraft(state.players);

      // Map the test owner's real ID for storyteller DM routing (not the fake userId,
      // which has no Discord account to receive DMs).
      setStoryteller(state.testOwnerId!, channelId);
      updateGame(state);

      // Announce in the game channel.
      await (message.channel as TextChannel).send(
        `🧪 **[TEST]** ${t(lang, 'iamAccepted', fakePlayer.displayName)}`,
      );

      // Send draft DM to the test owner, labelled as going to the fake storyteller.
      try {
        const testOwner = await client.users.fetch(state.testOwnerId!);
        const stLang = getLang(state.testOwnerId!);
        await testOwner.send(
          `📨 **[DM → ${fakePlayer.displayName} (Storyteller)]**\n\n` +
          renderDraft(state, stLang),
        );
      } catch {
        await message.reply(
          '⚠️ Could not DM you the draft. Please enable DMs from server members.',
        );
      }
      break;
    }

    case 'youare': {
      if (state.mode !== 'pending') {
        await message.reply(t(lang, 'errorAlreadyDecided'));
        return;
      }
      if (state.players.length === 16) {
        await message.reply(t(lang, 'errorYouareNeedsFifteen'));
        return;
      }

      state.storytellerId = null;
      state.mode = 'automated';
      state.phase = 'role_assignment';
      state.draft = generateDraft(state.players);
      updateGame(state);

      await (message.channel as TextChannel).send(
        `🧪 **[TEST]** ${t(lang, 'youareAccepted')}`,
      );
      await distributeRoles(client, state);
      break;
    }

    default: {
      await message.reply(
        `❌ \`!as\` does not support \`${subCmd}\` yet. Supported: \`iam\`, \`youare\`.`,
      );
    }
  }
}

/** Find a fake test player by username or displayName (case-insensitive prefix match). */
function resolveFakePlayer(name: string, players: Player[]): Player | undefined {
  const lower = name.toLowerCase();
  const fakes = players.filter(p => p.isTestPlayer);

  const exact = fakes.find(
    p => p.username.toLowerCase() === lower || p.displayName.toLowerCase() === lower,
  );
  if (exact) return exact;

  const prefixMatches = fakes.filter(
    p =>
      p.username.toLowerCase().startsWith(lower) ||
      p.displayName.toLowerCase().startsWith(lower),
  );
  if (prefixMatches.length === 1) return prefixMatches[0];

  return undefined;
}
