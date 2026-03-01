import { ChatInputCommandInteraction } from "discord.js";
import { getGame } from "../game/state";
import { getLang } from "../i18n";
import { getNightPendingPlayerNames, ensureRuntime } from "../game/night";
import { getActiveNominationInfo } from "../game/day";

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

  const runtime = ensureRuntime(state);

  // Day phase: show active nomination voting status
  if (runtime.daySession) {
    const info = getActiveNominationInfo(state);
    if (!info) {
      await interaction.reply({
        content:
          lang === "zh"
            ? "📋 当前没有进行中的提名投票。"
            : "📋 No nomination vote is currently in progress.",
        ephemeral: true,
      });
      return;
    }
    const voterList =
      info.voterNames.length > 0
        ? info.voterNames.join(lang === "zh" ? "、" : ", ")
        : lang === "zh"
          ? "（无）"
          : "(none yet)";
    await interaction.reply({
      content:
        lang === "zh"
          ? `🗳️ **${info.nominatorName}** 提名了 **${info.nomineeName}**\n已投票（${info.voteCount}）：${voterList}`
          : `🗳️ **${info.nominatorName}** nominated **${info.nomineeName}**\nVoted (${info.voteCount}): ${voterList}`,
      ephemeral: true,
    });
    return;
  }

  // Night phase: show who hasn't responded to their night action
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
