import { ChatInputCommandInteraction } from "discord.js";
import { getGame, getGameByStoryteller, getGameByPlayer } from "../game/state";
import { getLang, t } from "../i18n";
import { getDistribution } from "../game/distribution";
import { GameState, Lang } from "../game/types";
import { getPlayerState } from "../game/utils";

function phaseLabel(state: GameState, lang: Lang): string {
  switch (state.phase) {
    case "pending_storyteller":
      return t(lang, "infoPhaseAwaitStoryteller");
    case "role_assignment":
      return t(lang, "infoPhaseRoleAssignment");
    case "ended":
      return t(lang, "infoPhaseGameOver");
    case "in_progress": {
      const runtime = state.runtime;
      if (!runtime) return t(lang, "infoPhaseInProgress");
      if (runtime.daySession && runtime.daySession.status === "open") {
        return t(lang, "infoPhaseDayN", { n: runtime.daySession.dayNumber });
      }
      if (runtime.nightSession && runtime.nightSession.status !== "completed") {
        return t(lang, "infoPhaseNightN", { n: runtime.nightNumber });
      }
      return t(lang, "infoPhaseInProgress");
    }
  }
}

function buildInfoMessage(state: GameState, lang: Lang): string {
  const lines: string[] = [];

  // Header
  lines.push(t(lang, "infoHeader", { gameId: state.gameId }));
  lines.push("");

  // Phase
  lines.push(t(lang, "infoPhaseLabel", { phase: phaseLabel(state, lang) }));
  lines.push("");

  // Distribution (base, no Baron adjustment)
  try {
    const dist = getDistribution(state.players.length);
    lines.push(t(lang, "infoDistributionHeader"));
    lines.push(
      t(lang, "infoDistribution", {
        townsfolk: dist.townsfolk,
        outsiders: dist.outsiders,
        minions: dist.minions,
      }),
    );
  } catch {
    // Distribution not available for this player count — skip silently
  }
  lines.push("");

  // Win conditions
  lines.push(t(lang, "infoWinHeader"));
  lines.push(t(lang, "infoWinGood"));
  lines.push(t(lang, "infoWinGoodMayor"));
  lines.push(t(lang, "infoWinEvil"));
  lines.push(t(lang, "infoWinEvilSaint"));
  lines.push("");

  // Player list with alive status
  const runtime = state.runtime;
  lines.push(t(lang, "infoPlayersHeader", { count: state.players.length }));
  for (const player of state.players) {
    const ps = runtime ? getPlayerState(runtime, player.userId) : undefined;
    const alive = ps ? ps.alive : true; // assume alive before runtime initialises
    const icon = alive ? "🟢" : "💀";
    const statusLabel = alive ? t(lang, "infoAlive") : t(lang, "infoDead");
    lines.push(`${icon} **${player.displayName}** — ${statusLabel}`);
  }

  return lines.join("\n");
}

export async function handleInfo(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const lang = getLang(interaction.user.id, interaction.guildId);

  // In a guild channel, look up the game directly; in DM, search by user
  let state = getGame(interaction.channelId);
  if (!state) {
    state =
      getGameByStoryteller(interaction.user.id) ??
      getGameByPlayer(interaction.user.id);
  }

  if (!state) {
    await interaction.reply({
      content: t(lang, "infoNoActiveGame"),
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: buildInfoMessage(state, lang),
    ephemeral: true,
  });
}
