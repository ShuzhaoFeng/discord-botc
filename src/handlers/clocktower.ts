/**
 * Handles the !clocktower message command that starts a new game.
 *
 * Usage: !clocktower @player1 @player2 ... (5–16 mentions)
 *
 * The bot will:
 *  1. Validate the player count.
 *  2. Create a new private text channel.
 *  3. Post the welcome message and prompt for storyteller selection.
 */

import {
  Message,
  ChannelType,
  PermissionsBitField,
  GuildMember,
  TextChannel,
  Guild,
} from "discord.js";
import { createGame, nextGameNumber } from "../game/state";
import { GameState, Player } from "../game/types";
import { t, getLang } from "../i18n";

const COMMAND_PREFIX = "!clocktower";

export function isClockTowerCommand(content: string): boolean {
  return content.trim().toLowerCase().startsWith(COMMAND_PREFIX);
}

export async function handleClockTower(message: Message): Promise<void> {
  if (!message.guild) {
    await message.reply("This command can only be used in a server.");
    return;
  }

  const lang = getLang(message.author.id);
  const guild = message.guild;

  // Extract mentioned users (in order of appearance in the message).
  // Discord message.mentions.users does NOT preserve order; we parse from content.
  const mentionPattern = /<@!?(\d+)>/g;
  const mentionedIds: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = mentionPattern.exec(message.content)) !== null) {
    if (!seen.has(m[1])) {
      mentionedIds.push(m[1]);
      seen.add(m[1]);
    }
  }

  const total = mentionedIds.length;

  if (total < 5) {
    await message.reply(t(lang, "errorPlayerCount", total));
    return;
  }
  if (total > 16) {
    await message.reply(t(lang, "errorPlayerCount", total));
    return;
  }

  // Fetch GuildMember objects so we have displayName.
  const members: GuildMember[] = [];
  for (const id of mentionedIds) {
    try {
      const member = await guild.members.fetch(id);
      members.push(member);
    } catch {
      await message.reply(
        `❌ Could not fetch user <@${id}>. Make sure they are in the server.`,
      );
      return;
    }
  }

  // Create game state (mode = pending until /iam or /youare).
  const gameNumber = nextGameNumber();
  const gameId = `Clocktower #${gameNumber}`;

  const players: Player[] = members.map((member, index) => ({
    userId: member.id,
    username: member.user.username,
    displayName: member.displayName,
    seatIndex: index,
  }));

  // Create the game channel.
  const channelName = `clocktower-${gameNumber}`;
  const channel = await createGameChannel(
    guild,
    channelName,
    members,
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
  };
  createGame(state);

  // Announce in game channel.
  const playerMentions = players.map((p) => `<@${p.userId}>`);
  await channel.send(t(lang, "gameChannelReady", gameId, playerMentions));
  await channel.send(t(lang, "chooseStoryteller"));

  // Acknowledge in the original channel.
  await message.reply(`✅ A chamber stirs: <#${channel.id}>`);
}

export async function createGameChannel(
  guild: Guild,
  channelName: string,
  members: GuildMember[],
  invoker: GuildMember,
): Promise<TextChannel> {
  // Deny @everyone, allow each player and the bot.
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    ...members.map((member) => ({
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
      ],
    })),
    {
      id: guild.client.user!.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];

  // Also allow the invoker if not already included.
  if (!members.some((m) => m.id === invoker.id)) {
    permissionOverwrites.push({
      id: invoker.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    topic: `Blood on the Clocktower — ${channelName}`,
    permissionOverwrites,
  });

  return channel as TextChannel;
}
