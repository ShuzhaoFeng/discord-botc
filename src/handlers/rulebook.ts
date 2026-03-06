/**
 * Handles the /rulebook slash command.
 *
 * /rulebook               — lists all Trouble Brewing roles grouped by category
 * /rulebook role:<name>   — shows the detailed rules reminder for a specific role
 *                           (EN or ZH name accepted)
 */

import { ChatInputCommandInteraction } from "discord.js";
import { getLang, getRoleGuide, getRoleName, t } from "../i18n";
import { findRole, getScript } from "../game/roles";
import { Lang, Role } from "../game/types";

function buildList(lang: Lang): string {
  const { roles } = getScript();
  const tf = roles.filter((r) => r.category === "Townsfolk");
  const os = roles.filter((r) => r.category === "Outsider");
  const mn = roles.filter((r) => r.category === "Minion");
  const dm = roles.filter((r) => r.category === "Demon");
  const sections = [
    `**${t(lang, "categoryTownsfolk")} (${tf.length})**\n${tf.map((r) => getRoleName(lang, r.id)).join(" · ")}`,
    `**${t(lang, "categoryOutsider")} (${os.length})**\n${os.map((r) => getRoleName(lang, r.id)).join(" · ")}`,
    `**${t(lang, "categoryMinion")} (${mn.length})**\n${mn.map((r) => getRoleName(lang, r.id)).join(" · ")}`,
    `**${t(lang, "categoryDemon")} (${dm.length})**\n${dm.map((r) => getRoleName(lang, r.id)).join(" · ")}`,
  ];

  return [
    t(lang, "rulebookListTitle"),
    "",
    sections.join("\n\n"),
    "",
    t(lang, "rulebookListFooter"),
  ].join("\n");
}

// ─── Detail view ───────────────────────────────────────────────────────────────

function buildDetail(lang: Lang, role: Role): string {
  const name = getRoleName(lang, role.id);
  const cat = t(lang, `category${role.category}`);
  const guide = getRoleGuide(lang, role.id);

  const lines: string[] = [`📖 **${name}** · ${cat}`];

  if (guide) {
    lines.push("", guide);
  }

  return lines.join("\n");
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function handleRulebook(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const lang = getLang(interaction.user.id);
  const roleInput = interaction.options.getString("role");

  if (!roleInput) {
    await interaction.reply({ content: buildList(lang), ephemeral: true });
    return;
  }

  const role = findRole(roleInput);
  if (!role) {
    await interaction.reply({
      content: t(lang, "rulebookRoleNotFound", { name: roleInput }),
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: buildDetail(lang, role),
    ephemeral: true,
  });
}
