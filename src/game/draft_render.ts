import { Draft, GameState, Lang, Player } from "./types";
import { t } from "../i18n";

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function categoryDisplay(cat: string, lang: Lang): string {
  if (lang === "zh") {
    switch (cat) {
      case "Townsfolk":
        return "镇民";
      case "Outsider":
        return "外来者";
      case "Minion":
        return "爪牙";
      case "Demon":
        return "恶魔";
    }
  }
  return cat;
}

/**
 * Render the full draft message (sent to the storyteller in DM).
 * `lang` is the storyteller's language preference.
 */
export function renderDraft(
  state: GameState,
  lang: Lang,
  adjustmentNote?: string,
): string {
  const draft = state.draft!;
  const lines: string[] = [];

  lines.push(t(lang, "draftHeader", state.gameId));
  lines.push("");

  // Table
  const COL1 = 21,
    COL2 = 21,
    COL3 = 12;
  const header =
    pad(lang === "zh" ? "玩家" : "Player", COL1) +
    pad(lang === "zh" ? "角色" : "Role", COL2) +
    (lang === "zh" ? "类型" : "Type");
  lines.push("```");
  lines.push(header);
  lines.push("─".repeat(COL1 + COL2 + COL3));

  for (const player of state.players) {
    const role = draft.assignments.get(player.userId)!;
    const roleName = lang === "zh" ? role.nameZh : role.name;
    const roleDisplay =
      role.id === "drunk" && draft.drunkFakeRole
        ? `${roleName}  (fake: ${lang === "zh" ? draft.drunkFakeRole.nameZh : draft.drunkFakeRole.name})`
        : roleName;
    const catDisplay = categoryDisplay(role.category, lang);

    lines.push(
      pad(player.displayName, COL1) +
        pad(roleDisplay, COL2) +
        `[${catDisplay}]`,
    );
  }
  lines.push("```");
  lines.push("");

  // Special assignment lines
  if (draft.redHerring) {
    const rhPlayer = state.players.find((p) => p.userId === draft.redHerring);
    if (rhPlayer) {
      lines.push(t(lang, "draftRedHerring", rhPlayer.displayName));
    }
  }
  if (draft.impBluffs) {
    const [b1, b2, b3] = draft.impBluffs;
    lines.push(
      t(
        lang,
        "draftImpBluffs",
        lang === "zh" ? b1.nameZh : b1.name,
        lang === "zh" ? b2.nameZh : b2.name,
        lang === "zh" ? b3.nameZh : b3.name,
      ),
    );
  }

  if (adjustmentNote) {
    lines.push("");
    lines.push(t(lang, "draftAdjusted", adjustmentNote));
  }

  lines.push("");
  lines.push(t(lang, "draftCommands"));

  return lines.join("\n");
}

/**
 * Render the role DM sent to a player after CONFIRM.
 * For the Drunk, `role` is the FAKE role and `isDrunk` is true.
 */
export function renderRoleDm(
  gameId: string,
  displayRole: {
    id: string;
    name: string;
    nameZh: string;
    category: string;
    description: string;
    descriptionZh: string;
  },
  lang: Lang,
  impBluffs?: [
    { name: string; nameZh: string },
    { name: string; nameZh: string },
    { name: string; nameZh: string },
  ],
  impMinions?: string[],
  minionDemon?: string,
  minionPeers?: string[],
): string {
  const lines: string[] = [];
  lines.push(t(lang, "roleDmHeader", gameId));
  lines.push("");

  const roleName = lang === "zh" ? displayRole.nameZh : displayRole.name;
  const cat = categoryDisplay(displayRole.category, lang);
  lines.push(t(lang, "roleDmRole", roleName, cat));

  const desc =
    lang === "zh" ? displayRole.descriptionZh : displayRole.description;
  lines.push(t(lang, "roleDmAbility", desc));

  lines.push("");
  lines.push(t(lang, "roleDmBeginnerGuide", displayRole.id));

  if (impBluffs) {
    lines.push("");
    lines.push(
      t(
        lang,
        "roleDmImpBluffs",
        lang === "zh" ? impBluffs[0].nameZh : impBluffs[0].name,
        lang === "zh" ? impBluffs[1].nameZh : impBluffs[1].name,
        lang === "zh" ? impBluffs[2].nameZh : impBluffs[2].name,
      ),
    );
  }

  if (impMinions && impMinions.length > 0) {
    const list = impMinions.join(lang === "zh" ? "、" : ", ");
    lines.push("");
    lines.push(t(lang, "roleDmImpMinions", list));
  }

  if (minionDemon) {
    lines.push("");
    lines.push(t(lang, "roleDmMinionDemon", minionDemon));
  }

  if (minionPeers && minionPeers.length > 0) {
    const list = minionPeers.join(lang === "zh" ? "、" : ", ");
    lines.push("");
    lines.push(t(lang, "roleDmMinionPeers", list));
  }

  return lines.join("\n");
}
