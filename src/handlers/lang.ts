/**
 * Handles the /lang slash command.
 * Sets the language preference for the calling user.
 *
 * Usage: /lang language:en   or   /lang language:zh
 */

import { ChatInputCommandInteraction } from "discord.js";
import { getLang, setLang, t } from "../i18n";
import { Lang } from "../game/types";

const VALID_LANGS: Lang[] = ["en", "zh"];

export async function handleLang(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const lang = getLang(userId);
  const input = interaction.options
    .getString("language", true)
    .toLowerCase()
    .trim() as Lang;

  if (!VALID_LANGS.includes(input)) {
    await interaction.reply({
      content: t(lang, "langUnknown", { lang: input }),
      ephemeral: true,
    });
    return;
  }

  setLang(userId, input);
  const newLang = input;
  await interaction.reply({
    content: t(newLang, "langSet", {
      lang: newLang === "zh" ? "中文" : "English",
    }),
    ephemeral: true,
  });
}
