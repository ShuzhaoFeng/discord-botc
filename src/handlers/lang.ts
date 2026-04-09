/**
 * Handles the /lang slash command.
 * Sets the language preference for the calling user.
 *
 * Usage: /lang language:en   or   /lang language:zh
 */

import { ChatInputCommandInteraction } from "discord.js";
import { setLang, useTranslation } from "../i18n";
import { Lang } from "../game/types";

const VALID_LANGS: Lang[] = ["en", "zh"];

export async function handleLang(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const rawInput = interaction.options
    .getString("language", true)
    .toLowerCase()
    .trim();

  if (!VALID_LANGS.includes(rawInput as Lang)) {
    const tr = useTranslation(userId, interaction.guildId);
    await interaction.reply({
      content: tr("langUnknown", {
        lang: rawInput,
      }),
      ephemeral: true,
    });
    return;
  }

  const input = rawInput as Lang;
  // Only the calling user's preference is updated.
  setLang(userId, input);
  const newLang = input;
  const tr = useTranslation(userId, interaction.guildId);
  await interaction.reply({
    content: tr("langSet", {
      lang: newLang === "zh" ? "中文" : "English",
    }),
    ephemeral: true,
  });
}
