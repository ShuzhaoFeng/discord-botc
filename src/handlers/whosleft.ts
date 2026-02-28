import { ChatInputCommandInteraction } from "discord.js";
import { getGame } from "../game/state";
import { getLang } from "../i18n";
import { getNightPendingPlayerNames } from "../game/night";

export async function handleWhosleft(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const lang = getLang(interaction.user.id);
  const state = getGame(interaction.channelId);

  if (!state) {
    await interaction.reply({
      content:
        lang === "zh"
          ? "❌ 此命令只能在游戏频道中使用。"
          : "❌ This command can only be used in an active game channel.",
      ephemeral: true,
    });
    return;
  }

  if (state.mode !== "manual") {
    await interaction.reply({
      content:
        lang === "zh"
          ? "❌ /whosleft 仅在手动模式中可用。"
          : "❌ /whosleft is only available in Manual Mode.",
      ephemeral: true,
    });
    return;
  }

  const pending = getNightPendingPlayerNames(state);
  if (pending.length === 0) {
    await interaction.reply({
      content:
        lang === "zh"
          ? "✅ 当前夜晚阶段没有待回复的玩家。"
          : "✅ No pending player responses for the current night step.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content:
      lang === "zh"
        ? `⏳ 尚未回复的玩家：${pending.join("、")}`
        : `⏳ Players still pending: ${pending.join(", ")}`,
    ephemeral: true,
  });
}
