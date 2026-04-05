/**
 * Handles the !as <player> <command...> message command for test-mode impersonation.
 *
 * The test owner can act on behalf of fake players in the game channel.
 * The bot silently ignores the command if not in a test game or not sent by
 * the test owner — !as is invisible to normal players.
 *
 * All slash commands are dispatched via a command table built inside
 * handleImpersonate.  To support a new command, add one entry to that table.
 */

import {
  ChatInputCommandInteraction,
  Client,
  Message,
  TextChannel,
} from "discord.js";
import { getGame } from "../game/state";
import { getLang, t } from "../i18n";
import { Player } from "../game/types";
import { handleNominate, handleYe, handleEndDay } from "../game/day";
import { handleRoleCommand } from "../game/roleCommands";
import { handleIam } from "./iam";
import { handleYouare } from "./youare";
import { handleLang } from "./lang";
import { handleRulebook } from "./rulebook";
import { handleWhosleft } from "./whosleft";
import { handleInfo } from "./info";

const COMMAND_PREFIX = "!as ";

export function isImpersonateCommand(content: string): boolean {
  return content.trim().toLowerCase().startsWith(COMMAND_PREFIX);
}

/**
 * A minimal fake interaction adapter for slash commands.
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
      required ? (this._arg ?? "") : this._arg,
  };

  async reply(
    content: string | { content: string; ephemeral?: boolean },
  ): Promise<void> {
    const channel = this._msg.channel as TextChannel;
    if (typeof content === "string") {
      await channel.send(content);
    } else if (content.ephemeral) {
      // Keep private feedback visible only to the test owner
      await this._msg.reply(content.content);
    } else {
      await channel.send(content.content);
    }
  }
}

type CommandEntry = {
  handler: (i: ChatInputCommandInteraction, client: Client) => Promise<void>;
  argRequired?: boolean;
};

export async function handleImpersonate(
  message: Message,
  client: Client,
): Promise<void> {
  if (!message.guild) return;

  const channelId = message.channelId;
  const state = getGame(channelId);

  // Silent bail-out: not a test game, or not the test owner.
  if (!state || !state.testMode || state.testOwnerId !== message.author.id)
    return;

  // Parse: !as <playerName> <rest...>
  const raw = message.content.trim().slice(COMMAND_PREFIX.length).trim();
  const tokens = raw.split(/\s+/);
  const playerName = tokens[0];
  const rest = tokens.slice(1);

  if (!playerName || rest.length === 0) {
    await message.reply(
      t(getLang(message.author.id, message.guild.id), "impersonateUsage"),
    );
    return;
  }

  // Resolve to a fake player in this game.
  const fakePlayer = resolveFakePlayer(playerName, state.players);
  if (!fakePlayer) {
    await message.reply(
      t(
        getLang(message.author.id, message.guild.id),
        "impersonateUnknownPlayer",
        { name: playerName },
      ),
    );
    return;
  }

  /**
   * Command table — all supported slash commands, including iam/youare.
   *
   * iam passes testOwnerId as storytellerRoutingId so that storyteller DM
   * routing targets a real Discord account rather than the fake player's
   * synthetic ID.
   *
   * To support a new command, add one entry here — no other changes needed.
   */
  const commands: Record<string, CommandEntry> = {
    iam: { handler: (i, c) => handleIam(i, c, state.testOwnerId!) },
    youare: { handler: handleYouare },
    nominate: { handler: handleNominate, argRequired: true },
    ye: { handler: handleYe },
    slay: {
      handler: async (i, c) => {
        await handleRoleCommand(i, c);
      },
      argRequired: true,
    },
    endday: { handler: handleEndDay },
    lang: { handler: (i, _c) => handleLang(i), argRequired: true },
    rulebook: { handler: (i, _c) => handleRulebook(i) },
    whosleft: { handler: (i, _c) => handleWhosleft(i) },
    info: { handler: (i, _c) => handleInfo(i) },
  };

  const subCmd = rest[0].toLowerCase();
  const entry = commands[subCmd];

  if (!entry) {
    const supported = Object.keys(commands).join("`, `");
    await message.reply(
      `❌ \`!as\` does not support \`${subCmd}\`. Supported: \`${supported}\`.`,
    );
    return;
  }

  const argInput = rest.slice(1).join(" ") || null;
  if (entry.argRequired && !argInput) {
    await message.reply(`❌ Usage: \`!as <player> ${subCmd} <argument>\``);
    return;
  }

  const fakeI = new FakeDayInteraction(
    fakePlayer.userId,
    channelId,
    message,
    argInput,
  );
  await entry.handler(fakeI as unknown as ChatInputCommandInteraction, client);
}

/** Find a fake test player by username or displayName (case-insensitive prefix match). */
function resolveFakePlayer(
  name: string,
  players: Player[],
): Player | undefined {
  const lower = name.toLowerCase();
  const fakes = players.filter((p) => p.isTestPlayer);

  const exact = fakes.find(
    (p) =>
      p.username.toLowerCase() === lower ||
      p.displayName.toLowerCase() === lower,
  );
  if (exact) return exact;

  const prefixMatches = fakes.filter(
    (p) =>
      p.username.toLowerCase().startsWith(lower) ||
      p.displayName.toLowerCase().startsWith(lower),
  );
  if (prefixMatches.length === 1) return prefixMatches[0];

  return undefined;
}
