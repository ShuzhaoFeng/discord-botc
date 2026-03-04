import { ChatInputCommandInteraction } from "discord.js";
import { getGame } from "../game/state";
import { getLang, t } from "../i18n";
import { getNightPendingPlayerNames, ensureRuntime } from "../game/night";
import { getActiveNominationInfo } from "../game/day";

export async function handleWhosleft(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const lang = getLang(interaction.user.id);
  const state = getGame(interaction.channelId);

  if (!state) {
    await interaction.reply({
      content: t(lang, "errorNotGameChannel"),
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
        content: t(lang, "whosleftNoNomination"),
        ephemeral: true,
      });
      return;
    }
    const sep = lang === "zh" ? "、" : ", ";
    const voterList =
      info.voterNames.length > 0
        ? info.voterNames.join(sep)
        : t(lang, "whosleftNone");
    await interaction.reply({
      content: t(lang, "whosleftNominated", {
        nominator: info.nominatorName,
        nominee: info.nomineeName,
        count: info.voteCount,
        voters: voterList,
      }),
      ephemeral: true,
    });
    return;
  }

  // Night phase: show who hasn't responded to their night action
  const pending = getNightPendingPlayerNames(state);
  if (pending.length === 0) {
    await interaction.reply({
      content: t(lang, "whosleftNoPending"),
      ephemeral: true,
    });
    return;
  }

  const sep = lang === "zh" ? "、" : ", ";
  await interaction.reply({
    content: t(lang, "whosleftPending", { players: pending.join(sep) }),
    ephemeral: true,
  });
}
