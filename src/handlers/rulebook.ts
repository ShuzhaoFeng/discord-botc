/**
 * Handles the /rulebook slash command.
 *
 * /rulebook               — lists all Trouble Brewing roles grouped by category
 * /rulebook role:<name>   — shows the detailed rules reminder for a specific role
 *                           (EN or ZH name accepted)
 */

import { ChatInputCommandInteraction } from "discord.js";
import {
  getLang,
  getRoleGuide,
  getRoleName,
  t,
} from "../i18n";
import { ROLES, findRole } from "../game/roles";
import { Lang, Role } from "../game/types";

// ─── Category helpers ──────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["Townsfolk", "Outsider", "Minion", "Demon"] as const;

const CATEGORY_LABEL: Record<string, Record<string, string>> = {
  en: {
    Townsfolk: "Townsfolk",
    Outsider: "Outsiders",
    Minion: "Minions",
    Demon: "Demon",
  },
  zh: { Townsfolk: "镇民", Outsider: "外来者", Minion: "爪牙", Demon: "恶魔" },
};

function catLabel(lang: Lang, cat: string): string {
  return CATEGORY_LABEL[lang]?.[cat] ?? cat;
}

// ─── List view ─────────────────────────────────────────────────────────────────

function buildList(lang: Lang): string {
  const sections = CATEGORY_ORDER.map((cat) => {
    const roles = ROLES.filter((r) => r.category === cat);
    const names = roles.map((r) => getRoleName(lang, r.id)).join(" · ");
    return `**${catLabel(lang, cat)} (${roles.length})**\n${names}`;
  });

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
  const cat = catLabel(lang, role.category);
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
