import { Lang, Role } from "./types";
import { t, getRoleGuide, getRoleName } from "../i18n";

/**
 * Render the role DM sent to a player after CONFIRM.
 * For the Drunk, `role` is the FAKE role and `isDrunk` is true.
 */
export function renderRoleDm(
  gameId: string,
  displayRole: Role,
  lang: Lang,
  impBluffs?: [Role, Role, Role],
  impMinions?: string[],
  minionDemon?: string,
  minionPeers?: string[],
): string {
  const lines: string[] = [];
  lines.push(t(lang, "roleDmHeader", { gameId }));
  lines.push("");

  const roleName = getRoleName(lang, displayRole.id);
  const cat = t(lang, `category${displayRole.category}`);
  lines.push(t(lang, "roleDmRole", { roleName, category: cat }));

  lines.push("");
  lines.push(getRoleGuide(lang, displayRole.id) ?? t(lang, "roleDmBeginnerGuide"));

  if (impBluffs) {
    lines.push("");
    lines.push(
      t(lang, "roleDmImpBluffs", {
        b1: getRoleName(lang, impBluffs[0].id),
        b2: getRoleName(lang, impBluffs[1].id),
        b3: getRoleName(lang, impBluffs[2].id),
      }),
    );
  }

  if (impMinions && impMinions.length > 0) {
    const list = impMinions.join(lang === "zh" ? "、" : ", ");
    lines.push("");
    lines.push(t(lang, "roleDmImpMinions", { minions: list }));
  }

  if (minionDemon) {
    lines.push("");
    lines.push(t(lang, "roleDmMinionDemon", { demon: minionDemon }));
  }

  if (minionPeers && minionPeers.length > 0) {
    const list = minionPeers.join(lang === "zh" ? "、" : ", ");
    lines.push("");
    lines.push(t(lang, "roleDmMinionPeers", { peers: list }));
  }

  return lines.join("\n");
}
