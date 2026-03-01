import { ChatInputCommandInteraction } from "discord.js";
import { getGame, getGameByStoryteller, getGameByPlayer } from "../game/state";
import { getLang } from "../i18n";
import { getDistribution } from "../game/distribution";
import { GameState, Lang } from "../game/types";

function phaseLabel(state: GameState, lang: Lang): string {
  const zh = lang === "zh";
  switch (state.phase) {
    case "pending_storyteller":
      return zh ? "⏳ 等待说书人" : "⏳ Awaiting Storyteller";
    case "role_assignment":
      return zh ? "📋 角色分配中" : "📋 Role Assignment";
    case "ended":
      return zh ? "🏁 游戏已结束" : "🏁 Game Over";
    case "in_progress": {
      const runtime = state.runtime;
      if (!runtime) return zh ? "🎮 进行中" : "🎮 In Progress";
      if (runtime.daySession && runtime.daySession.status === "open") {
        return zh ? `☀️ 第 ${runtime.daySession.dayNumber} 天` : `☀️ Day ${runtime.daySession.dayNumber}`;
      }
      if (runtime.nightSession && runtime.nightSession.status !== "completed") {
        return zh ? `🌙 第 ${runtime.nightNumber} 夜` : `🌙 Night ${runtime.nightNumber}`;
      }
      return zh ? "🎮 进行中" : "🎮 In Progress";
    }
  }
}

function buildInfoMessage(state: GameState, lang: Lang): string {
  const zh = lang === "zh";
  const lines: string[] = [];

  // Header
  lines.push(zh ? `📖 **${state.gameId} — 游戏信息**` : `📖 **${state.gameId} — Game Info**`);
  lines.push("");

  // Phase
  lines.push(zh ? `**当前阶段：** ${phaseLabel(state, lang)}` : `**Phase:** ${phaseLabel(state, lang)}`);
  lines.push("");

  // Distribution (base, no Baron adjustment)
  try {
    const dist = getDistribution(state.players.length);
    if (zh) {
      lines.push("**角色分配（基础，不含男爵调整）：**");
      lines.push(
        `• 镇民 ${dist.townsfolk} · 外来者 ${dist.outsiders} · 爪牙 ${dist.minions} · 恶魔 ${dist.demon}`,
      );
    } else {
      const tStr = `${dist.townsfolk} Townsfolk`;
      const oStr = `${dist.outsiders} Outsider${dist.outsiders !== 1 ? "s" : ""}`;
      const mStr = `${dist.minions} Minion${dist.minions !== 1 ? "s" : ""}`;
      lines.push("**Role Distribution (base, excluding Baron):**");
      lines.push(`• ${tStr} · ${oStr} · ${mStr} · 1 Demon`);
    }
  } catch {
    // Distribution not available for this player count — skip silently
  }
  lines.push("");

  // Win conditions
  if (zh) {
    lines.push("**胜利条件：**");
    lines.push("• **善良胜利**：所有恶魔死亡。");
    lines.push("• **善良胜利**（市长）：仅剩 3 名玩家存活且当天无处决。");
    lines.push("• **邪恶胜利**：恶魔存活且仅剩 2 名（或更少）玩家存活。");
    lines.push("• **邪恶胜利**（圣徒）：圣徒被处决，邪恶立即获胜。");
  } else {
    lines.push("**Win Conditions:**");
    lines.push("• **Good wins:** All Demons are dead.");
    lines.push("• **Good wins** (Mayor): Only 3 players remain alive and no execution occurs that day.");
    lines.push("• **Evil wins:** A Demon is alive and only 2 or fewer players remain alive.");
    lines.push("• **Evil wins** (Saint): The Saint is executed — Evil wins immediately.");
  }
  lines.push("");

  // Player list with alive status
  const runtime = state.runtime;
  lines.push(zh ? `**玩家（${state.players.length} 人）：**` : `**Players (${state.players.length}):**`);
  for (const player of state.players) {
    const ps = runtime?.playerStates.get(player.userId);
    const alive = ps ? ps.alive : true; // assume alive before runtime initialises
    const icon = alive ? "🟢" : "💀";
    const statusLabel = alive ? (zh ? "存活" : "alive") : (zh ? "已死亡" : "dead");
    lines.push(`${icon} **${player.displayName}** — ${statusLabel}`);
  }

  return lines.join("\n");
}

export async function handleInfo(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const lang = getLang(interaction.user.id);
  const zh = lang === "zh";

  // In a guild channel, look up the game directly; in DM, search by user
  let state = getGame(interaction.channelId);
  if (!state) {
    state =
      getGameByStoryteller(interaction.user.id) ??
      getGameByPlayer(interaction.user.id);
  }

  if (!state) {
    await interaction.reply({
      content: zh
        ? "❌ 未找到与你相关的进行中游戏。请在游戏频道中使用此命令。"
        : "❌ No active game found. Use this command inside a game channel, or have an active game as a player or Storyteller.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: buildInfoMessage(state, lang),
    ephemeral: true,
  });
}
