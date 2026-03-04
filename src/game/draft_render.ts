import { Draft, GameState, Lang, Player, Role } from "./types";
import { t, getRoleDescription, getRoleGuide, getRoleName } from "../i18n";

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function categoryDisplay(cat: string, lang: Lang): string {
  const key = `category${cat}`;
  return t(lang, key);
}

/**
 * Render the full draft message (sent to the storyteller in DM).
 * `lang` is the storyteller's language preference.
 * `adjustmentNote` is an already-formatted string (pre-translated by caller).
 */
export function renderDraft(
  state: GameState,
  lang: Lang,
  adjustmentNote?: string,
): string {
  const draft = state.draft!;
  const lines: string[] = [];

  lines.push(t(lang, "draftHeader", { gameId: state.gameId }));
  lines.push("");

  // Table
  const COL1 = 21,
    COL2 = 21,
    COL3 = 12;
  const header =
    pad(t(lang, "draftColPlayer"), COL1) +
    pad(t(lang, "draftColRole"), COL2) +
    t(lang, "draftColType");
  lines.push("```");
  lines.push(header);
  lines.push("─".repeat(COL1 + COL2 + COL3));

  for (const player of state.players) {
    const role = draft.assignments.get(player.userId)!;
    const roleName = getRoleName(lang, role.id);
    const roleDisplay =
      role.id === "drunk" && draft.drunkFakeRole
        ? `${roleName}  (${t(lang, "draftDrunkFake", { role: getRoleName(lang, draft.drunkFakeRole.id) })})`
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
      lines.push(
        t(lang, "draftRedHerring", { playerName: rhPlayer.displayName }),
      );
    }
  }
  if (draft.impBluffs) {
    const [b1, b2, b3] = draft.impBluffs;
    lines.push(
      t(lang, "draftImpBluffs", {
        r1: getRoleName(lang, b1.id),
        r2: getRoleName(lang, b2.id),
        r3: getRoleName(lang, b3.id),
      }),
    );
  }

  if (adjustmentNote) {
    lines.push("");
    lines.push(t(lang, "draftAdjusted", { note: adjustmentNote }));
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
  const cat = categoryDisplay(displayRole.category, lang);
  lines.push(t(lang, "roleDmRole", { roleName, category: cat }));

  const desc = getRoleDescription(lang, displayRole.id);
  lines.push(t(lang, "roleDmAbility", { description: desc }));

  lines.push("");
  // Use the role guide if available, otherwise fall back to the generic beginner guide string
  lines.push(
    getRoleGuide(lang, displayRole.id) ?? t(lang, "roleDmBeginnerGuide"),
  );

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
