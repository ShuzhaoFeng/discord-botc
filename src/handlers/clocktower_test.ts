/**
 * Handles the !ctest message command that starts a game in Test Mode.
 *
 * Usage: !ctest [token...] [token...]
 *   @mention  → real Discord player
 *   plain word → fake player with that name (no spaces)
 *
 * The command author is the test owner: they receive all DMs redirected from
 * fake players and do NOT need to appear in the player list themselves.
 *
 * All game rules (player count 5–16, storyteller selection, role assignment)
 * apply exactly as in the normal !clocktower command.
 *
 * Test mode impersonation (game channel commands):
 *   !as <player> iam      — fake player claims the Storyteller role
 *   !as <player> youare   — fake player triggers Automated Mode
 *
 * Impersonation for future in-game player actions (night/day phases) is TBD.
 */

import { Message, GuildMember } from "discord.js";
import { createGame, nextGameNumber } from "../game/state";
import { GameState, Player, FAKE_PLAYER_ID_PREFIX } from "../game/types";
import { t, getLang } from "../i18n";
import { createGameChannel } from "./clocktower";

const COMMAND_PREFIX = "!ctest";

export function isCtestCommand(content: string): boolean {
  return content.trim().toLowerCase().startsWith(COMMAND_PREFIX);
}

export async function handleCtest(message: Message): Promise<void> {
  const lang = getLang(message.author.id);

  if (!message.guild) {
    await message.reply(t(lang, "clocktowerServerOnly"));
    return;
  }

  const guild = message.guild;
  const testOwnerId = message.author.id;

  // Parse tokens after "!ctest ".
  const raw = message.content.trim().slice(COMMAND_PREFIX.length).trim();
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0);

  const mentionPattern = /^<@!?(\d+)>$/;
  const players: Player[] = [];
  const seenRealIds = new Set<string>();
  const seenFakeNames = new Set<string>(); // lower-cased
  const realMembers: GuildMember[] = []; // for channel permissions

  for (const token of tokens) {
    const mentionMatch = mentionPattern.exec(token);

    if (mentionMatch) {
      // Real Discord player.
      const userId = mentionMatch[1];
      if (seenRealIds.has(userId)) continue;
      seenRealIds.add(userId);

      let member: GuildMember;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        await message.reply(t(lang, "clocktowerFetchError", { id: userId }));
        return;
      }
      realMembers.push(member);
      players.push({
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        seatIndex: players.length,
        isTestPlayer: false,
      });
    } else {
      // Fake player — plain word.
      const nameLower = token.toLowerCase();
      if (seenFakeNames.has(nameLower)) continue;
      seenFakeNames.add(nameLower);

      players.push({
        userId: `${FAKE_PLAYER_ID_PREFIX}${nameLower.replace(/\W+/g, "_")}`,
        username: token,
        displayName: token,
        seatIndex: players.length,
        isTestPlayer: true,
      });
    }
  }

  const total = players.length;

  if (total < 5) {
    await message.reply(t(lang, "errorPlayerCount", { n: total }));
    return;
  }
  if (total > 16) {
    await message.reply(t(lang, "errorPlayerCount", { n: total }));
    return;
  }

  // Create game state.
  const gameNumber = nextGameNumber();
  const gameId = `Clocktower #${gameNumber}`;

  // Channel: only real members get Discord permissions; test owner always has access.
  const channelName = `clocktower-${gameNumber}`;
  const channel = await createGameChannel(
    guild,
    channelName,
    realMembers,
    message.member!,
  );

  const state: GameState = {
    gameId,
    gameNumber,
    guildId: guild.id,
    channelId: channel.id,
    players,
    storytellerId: null,
    mode: "pending",
    phase: "pending_storyteller",
    draft: null,
    runtime: null,
    testMode: true,
    testOwnerId,
  };
  createGame(state);

  // Welcome message: real players shown as @mention, fake players as **Name** *(test)*.
  const playerLabels = players.map((p) =>
    p.isTestPlayer ? `**${p.displayName}** *(test)*` : `<@${p.userId}>`,
  );
  await channel.send(
    t(lang, "ctestGameChannelReady", {
      gameHeader: t(lang, "gameChannelReady", {
        gameId,
        players: playerLabels.join(", "),
      }),
      ownerId: testOwnerId,
    }),
  );
  await channel.send(t(lang, "chooseStoryteller"));

  await message.reply(
    t(lang, "ctestChannelCreated", { channelId: channel.id }),
  );
}
