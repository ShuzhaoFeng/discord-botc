/**
 * Handles the !as <player> <command...> message command for test-mode impersonation.
 *
 * The test owner can act on behalf of fake players in the game channel.
 * The bot silently ignores the command if not in a test game or not sent by
 * the test owner — !as is invisible to normal players.
 *
 * Supported sub-commands:
 *   !as <player> iam                 — fake player claims the Storyteller role (Manual Mode)
 *   !as <player> youare              — fake player triggers Automated Mode
 *   !as <player> nominate <target>   — nominate a player for execution (day phase)
 *   !as <player> ye                  — vote for the current nominee (day phase)
 *   !as <player> slay <target>       — use Slayer ability (day phase)
 *   !as <player> endday              — vote to end the day (day phase)
 */

import { ChatInputCommandInteraction, Client, Message, TextChannel } from 'discord.js';
import { getGame, updateGame, setStoryteller } from '../game/state';
import { getLang, t } from '../i18n';
import { generateDraft } from '../game/assignment';
import { renderDraft } from '../game/draft_render';
import { distributeRoles } from './role_sender';
import { Player } from '../game/types';
import { handleNominate, handleYe, handleSlay, handleEndDay } from '../game/day';
import { handleLang } from './lang';
import { handleRulebook } from './rulebook';

const COMMAND_PREFIX = '!as ';

export function isImpersonateCommand(content: string): boolean {
  return content.trim().toLowerCase().startsWith(COMMAND_PREFIX);
}

/**
 * A minimal fake interaction adapter for the day-phase slash commands.
 *
 * Public replies (non-ephemeral) go to the game channel so they are visible to
 * all players.  Ephemeral "private" replies are sent back to the test owner as
 * a message reply so they don't pollute the game channel.
 */
class FakeDayInteraction {
  user: { id: string };
  channelId: string;
  private _msg: Message;
  private _arg: string | null;

  constructor(
    userId: string,
    channelId: string,
    msg: Message,
    arg: string | null,
  ) {
    this.user = { id: userId };
    this.channelId = channelId;
    this._msg = msg;
    this._arg = arg;
  }

  options = {
    getString: (_name: string, required?: boolean): string | null =>
      required ? (this._arg ?? '') : this._arg,
  };

  async reply(
    content: string | { content: string; ephemeral?: boolean },
  ): Promise<void> {
    const channel = this._msg.channel as TextChannel;
    if (typeof content === 'string') {
      await channel.send(content);
    } else if (content.ephemeral) {
      // Keep private feedback visible only to the test owner
      await this._msg.reply(content.content);
    } else {
      await channel.send(content.content);
    }
  }
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
    const lang0 = getLang(message.author.id);
    await message.reply(t(lang0, 'impersonateUsage'));
    return;
  }

  // Resolve to a fake player in this game.
  const fakePlayer = resolveFakePlayer(playerName, state.players);
  if (!fakePlayer) {
    const lang0 = getLang(message.author.id);
    await message.reply(t(lang0, 'impersonateUnknownPlayer', { name: playerName }));
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
        `🧪 **[TEST]** ${t(lang, 'iamAccepted', { username: fakePlayer.displayName })}`,
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
        await message.reply(t(lang, 'iamDmFailed'));
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

    // ── Day-phase commands ────────────────────────────────────────────────────

    case 'nominate': {
      const nomineeInput = rest.slice(1).join(' ');
      if (!nomineeInput) {
        await message.reply('❌ Usage: `!as <player> nominate <target>`');
        return;
      }
      const fakeI = new FakeDayInteraction(
        fakePlayer.userId, channelId, message, nomineeInput,
      );
      await handleNominate(fakeI as unknown as ChatInputCommandInteraction, client);
      break;
    }

    case 'ye': {
      const fakeI = new FakeDayInteraction(
        fakePlayer.userId, channelId, message, null,
      );
      await handleYe(fakeI as unknown as ChatInputCommandInteraction, client);
      break;
    }

    case 'slay': {
      const targetInput = rest.slice(1).join(' ');
      if (!targetInput) {
        await message.reply('❌ Usage: `!as <player> slay <target>`');
        return;
      }
      const fakeI = new FakeDayInteraction(
        fakePlayer.userId, channelId, message, targetInput,
      );
      await handleSlay(fakeI as unknown as ChatInputCommandInteraction, client);
      break;
    }

    case 'endday': {
      const fakeI = new FakeDayInteraction(
        fakePlayer.userId, channelId, message, null,
      );
      await handleEndDay(fakeI as unknown as ChatInputCommandInteraction, client);
      break;
    }

    case 'lang': {
      const langInput = rest[1] ?? null;
      if (!langInput) {
        await message.reply('❌ Usage: `!as <player> lang <en|zh>`');
        return;
      }
      const fakeI = new FakeDayInteraction(fakePlayer.userId, channelId, message, langInput);
      await handleLang(fakeI as unknown as ChatInputCommandInteraction);
      break;
    }

    case 'rulebook': {
      const roleInput = rest.slice(1).join(' ') || null;
      const fakeI = new FakeDayInteraction(fakePlayer.userId, channelId, message, roleInput);
      await handleRulebook(fakeI as unknown as ChatInputCommandInteraction);
      break;
    }

    default: {
      await message.reply(
        `❌ \`!as\` does not support \`${subCmd}\`. Supported: \`iam\`, \`youare\`, \`nominate\`, \`ye\`, \`slay\`, \`endday\`, \`lang\`, \`rulebook\`.`,
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
