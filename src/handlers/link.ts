/**
 * Handles the /link slash command.
 * Sets the townsquare session URL for the current game so the bot can
 * connect as a spectator.
 */

import { ChatInputCommandInteraction } from "discord.js";
import { getGame, updateGame } from "../game/state";
import { useTranslation } from "../i18n";

/**
 * Parses a townsquare URL and extracts the session channel name from the
 * hash fragment. Returns null if no fragment is present.
 *
 *   "https://clocktower.live/#foobar"  → "foobar"
 *   "https://custom.host/#myroom"      → "myroom"
 */
function parseSessionChannel(url: string): string | null {
  const hashIdx = url.indexOf("#");
  if (hashIdx === -1) return null;
  const channel = url.slice(hashIdx + 1).trim();
  return channel || null;
}

export async function handleLink(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const tr = useTranslation(interaction.user.id, interaction.guildId);
  const state = getGame(interaction.channelId);

  if (!state) {
    await interaction.reply({
      content: tr("errorNotGameChannel"),
      ephemeral: true,
    });
    return;
  }

  const url = interaction.options.getString("url", true);
  const sessionChannel = parseSessionChannel(url);

  if (!sessionChannel) {
    await interaction.reply({
      content: tr("linkInvalidUrl"),
      ephemeral: true,
    });
    return;
  }

  state.townsquareSessionUrl = url;
  updateGame(state);

  await interaction.reply(tr("linkSet", { url, channel: sessionChannel }));
}
