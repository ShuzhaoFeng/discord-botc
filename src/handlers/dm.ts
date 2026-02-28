/**
 * Handles DM messages from the storyteller during Manual Mode role assignment.
 *
 * Supported commands (case-insensitive):
 *   SWAP <player1> <player2>
 *   ROLE <player> <new-role>
 *   HERRING <player>
 *   DRUNK <role>
 *   BLUFF <role1>, <role2>, <role3>
 *   ASSIGN (block — processed in one go, terminated by CONFIRM)
 *   CONFIRM
 */

import { Client, Message } from "discord.js";
import { getGameByStoryteller, updateGame } from "../game/state";
import { getLang, t } from "../i18n";
import { findRole, TOWNSFOLK } from "../game/roles";
import {
  swapRoles,
  setRole,
  validateDraft,
  ValidationError,
  reconcileDraftDependencies,
} from "../game/assignment";
import { renderDraft } from "../game/draft_render";
import { distributeRoles } from "./role_sender";
import {
  Draft,
  Lang,
  Player,
  Role,
  FAKE_PLAYER_ID_PREFIX,
} from "../game/types";

export async function handleStorytelllerDm(
  message: Message,
  client: Client,
): Promise<void> {
  const userId = message.author.id;
  const state = getGameByStoryteller(userId);

  if (!state || state.mode !== "manual" || state.phase !== "role_assignment") {
    // Not a storyteller DM we should handle.
    return;
  }

  if (!state.draft) return;

  const lang = getLang(userId);
  // In test mode the test owner may prefix messages with "!as <player>" for
  // clarity (e.g. "!as Alice SWAP Bob Charlie"). Validate and strip that prefix.
  let rawContent = message.content.trim();
  const asMatch = /^!as\s+(\S+)\s*/i.exec(rawContent);
  if (asMatch) {
    const namedId =
      FAKE_PLAYER_ID_PREFIX + asMatch[1].toLowerCase().replace(/\W+/g, "_");
    if (
      !state.testMode ||
      !state.storytellerId?.startsWith(FAKE_PLAYER_ID_PREFIX) ||
      namedId !== state.storytellerId
    ) {
      await message.reply(
        `❌ \`${asMatch[1]}\` is not the current storyteller.`,
      );
      return;
    }
    rawContent = rawContent.slice(asMatch[0].length);
  }
  const lines = rawContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const responses: string[] = [];
  let shouldResendDraft = false;
  let confirmed = false;
  const adjustmentNotes: string[] = [];

  // Check if this is an ASSIGN block.
  const firstLine = lines[0]?.toUpperCase();
  if (firstLine === "ASSIGN") {
    const result = processAssignBlock(
      lines.slice(1),
      state.draft,
      state.players,
      lang,
    );
    if ("message" in result) {
      responses.push(t(lang, "draftCmdValidationError", result.message));
    } else {
      if (result.adjustmentNote) adjustmentNotes.push(result.adjustmentNote);
      if (result.confirmed) {
        confirmed = true;
        responses.push(t(lang, "draftConfirmed"));
      } else {
        shouldResendDraft = true;
      }
    }
  } else {
    // Process commands line by line.
    for (const line of lines) {
      const upper = line.toUpperCase();

      if (upper === "CONFIRM") {
        const validErr = validateDraft(state.draft, state.players);
        if (validErr) {
          responses.push(
            t(
              lang,
              "draftCmdValidationError",
              lang === "zh" ? validErr.messageZh : validErr.message,
            ),
          );
        } else {
          confirmed = true;
          responses.push(t(lang, "draftConfirmed"));
        }
        break; // No further commands after CONFIRM.
      }

      const cmdResult = processCommand(line, state.draft, state.players, lang);
      responses.push(cmdResult.response);
      if (cmdResult.adjustmentNote)
        adjustmentNotes.push(cmdResult.adjustmentNote);
      if (!cmdResult.error) {
        const reconciled = reconcileDraftDependencies(
          state.draft,
          state.players,
        );
        const reconcileNote =
          lang === "zh"
            ? reconciled.adjustmentNoteZh
            : reconciled.adjustmentNote;
        if (reconcileNote) adjustmentNotes.push(reconcileNote);
        shouldResendDraft = true;
      }
    }
  }

  // Send accumulated responses.
  if (responses.length > 0) {
    await message.reply(responses.join("\n"));
  }

  if (confirmed) {
    state.phase = "role_assignment"; // keeps phase until distributeRoles sets it to in_progress
    updateGame(state);
    await distributeRoles(client, state);
    return;
  }

  // Re-send the updated draft if any successful command was processed.
  if (shouldResendDraft) {
    updateGame(state);
    await message.author.send(
      renderDraft(
        state,
        lang,
        adjustmentNotes.length > 0 ? adjustmentNotes.join("\n") : undefined,
      ),
    );
  }
}

// ─── ASSIGN block processor ───────────────────────────────────────────────────

interface AssignResult {
  confirmed: boolean;
  adjustmentNote?: string;
}

function processAssignBlock(
  lines: string[],
  draft: Draft,
  players: Player[],
  lang: Lang,
): AssignResult | ValidationError {
  // Parse the block; detect embedded HERRING/DRUNK/BLUFF/CONFIRM.
  const newAssignments = new Map<string, Role>();
  let newDrunkFake: Role | null = draft.drunkFakeRole;
  let newRedHerring: string | null = draft.redHerring;
  let newImpBluffs: [Role, Role, Role] | null = draft.impBluffs;
  let confirmed = false;

  for (const line of lines) {
    const upper = line.toUpperCase().trim();

    if (upper === "CONFIRM") {
      confirmed = true;
      continue;
    }

    if (upper.startsWith("HERRING ")) {
      const playerName = line.slice("HERRING ".length).trim();
      const p = resolvePlayer(playerName, players);
      if (!p)
        return {
          message: `Unknown player: "${playerName}"`,
          messageZh: `未知玩家："${playerName}"`,
        };
      newRedHerring = p.userId;
      continue;
    }

    if (upper.startsWith("DRUNK ")) {
      const roleName = line.slice("DRUNK ".length).trim();
      const role = findRole(roleName);
      if (!role || role.category !== "Townsfolk") {
        return {
          message: `Invalid DRUNK role: "${roleName}"`,
          messageZh: `无效的酒鬼虚假身份："${roleName}"`,
        };
      }
      newDrunkFake = role;
      continue;
    }

    if (upper.startsWith("BLUFF ")) {
      const parts = line
        .slice("BLUFF ".length)
        .split(",")
        .map((s) => s.trim());
      if (parts.length !== 3) {
        return {
          message: "BLUFF requires exactly 3 roles.",
          messageZh: "BLUFF 需要恰好3个角色。",
        };
      }
      const bluffRoles = parts.map(findRole);
      if (bluffRoles.some((r) => !r)) {
        return {
          message: "One or more bluff roles not found.",
          messageZh: "一个或多个虚张声势角色未找到。",
        };
      }
      newImpBluffs = bluffRoles as [Role, Role, Role];
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      return {
        message: `Cannot parse line: "${line}"`,
        messageZh: `无法解析行："${line}"`,
      };
    }
    const playerName = line.slice(0, colonIdx).trim();
    const roleName = line.slice(colonIdx + 1).trim();

    const p = resolvePlayer(playerName, players);
    if (!p)
      return {
        message: `Unknown player: "${playerName}"`,
        messageZh: `未知玩家："${playerName}"`,
      };

    const role = findRole(roleName);
    if (!role)
      return {
        message: `Unknown role: "${roleName}"`,
        messageZh: `未知角色："${roleName}"`,
      };

    newAssignments.set(p.userId, role);
  }

  // Must have exactly the right number of player assignments.
  const playerAssignmentCount = newAssignments.size;
  if (playerAssignmentCount > 0 && playerAssignmentCount !== players.length) {
    return {
      message: `Assignment has ${playerAssignmentCount} entries but game has ${players.length} players.`,
      messageZh: `分配共有 ${playerAssignmentCount} 条记录，但游戏有 ${players.length} 名玩家。`,
    };
  }

  if (newAssignments.size > 0) {
    // Replace all assignments.
    for (const [uid, role] of newAssignments) {
      draft.assignments.set(uid, role);
    }
  }

  draft.drunkFakeRole = newDrunkFake;
  draft.redHerring = newRedHerring;
  draft.impBluffs = newImpBluffs;

  const reconciled = reconcileDraftDependencies(draft, players);
  const adjustmentNote =
    lang === "zh" ? reconciled.adjustmentNoteZh : reconciled.adjustmentNote;

  const validErr = validateDraft(draft, players);
  if (validErr) return validErr;

  return { confirmed, adjustmentNote };
}

// ─── Single-command processor ─────────────────────────────────────────────────

interface CommandResult {
  response: string;
  error: boolean;
  adjustmentNote?: string;
}

function processCommand(
  line: string,
  draft: Draft,
  players: Player[],
  lang: Lang,
): CommandResult {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0]?.toUpperCase();

  switch (cmd) {
    case "SWAP":
      return cmdSwap(line, draft, players, lang);
    case "ROLE":
      return cmdRole(line, draft, players, lang);
    case "HERRING":
      return cmdHerring(line, draft, players, lang);
    case "DRUNK":
      return cmdDrunk(line, draft, players, lang);
    case "BLUFF":
      return cmdBluff(line, draft, players, lang);
    default:
      return { response: `❌ Unknown command: "${cmd}".`, error: true };
  }
}

// ─── SWAP ─────────────────────────────────────────────────────────────────────

function cmdSwap(
  line: string,
  draft: Draft,
  players: Player[],
  lang: Lang,
): CommandResult {
  // SWAP <p1> <p2> — names are each one "word" (usernames have no spaces).
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) {
    return { response: t(lang, "draftCmdSwapUsage"), error: true };
  }
  const name1 = parts[1];
  const name2 = parts.slice(2).join(" "); // handle edge case of spaces in display name

  const p1 = resolvePlayer(name1, players);
  const p2 = resolvePlayer(name2, players);

  if (!p1)
    return { response: t(lang, "draftCmdUnknownPlayer", name1), error: true };
  if (!p2)
    return { response: t(lang, "draftCmdUnknownPlayer", name2), error: true };

  swapRoles(draft, p1.userId, p2.userId);

  const r1 = draft.assignments.get(p1.userId)!;
  const r2 = draft.assignments.get(p2.userId)!;
  const rn1 = lang === "zh" ? r1.nameZh : r1.name;
  const rn2 = lang === "zh" ? r2.nameZh : r2.name;
  return {
    response: lang === "zh"
      ? `✅ 命运已交换：${p1.displayName} ↔ ${p2.displayName}（${rn2} ↔ ${rn1}）`
      : `✅ Fates exchanged: ${p1.displayName} ↔ ${p2.displayName} (${rn2} ↔ ${rn1})`,
    error: false,
  };
}

// ─── ROLE ─────────────────────────────────────────────────────────────────────

function cmdRole(
  line: string,
  draft: Draft,
  players: Player[],
  lang: Lang,
): CommandResult {
  // ROLE <player> <new-role>
  // Since role names may have spaces, we try each split point.
  const rest = line.trim().slice("ROLE".length).trim();
  if (!rest) return { response: t(lang, "draftCmdRoleUsage"), error: true };

  // Try to find a player match by progressively taking words from the left.
  const words = rest.split(/\s+/);
  let player: Player | undefined;
  let roleStr: string | undefined;

  for (let i = 1; i <= words.length - 1; i++) {
    const candidateName = words.slice(0, i).join(" ");
    const candidateRole = words.slice(i).join(" ");
    const p = resolvePlayer(candidateName, players);
    if (p) {
      player = p;
      roleStr = candidateRole;
      break;
    }
  }

  if (!player || !roleStr) {
    return { response: t(lang, "draftCmdRoleUsage"), error: true };
  }

  const newRole = findRole(roleStr);
  if (!newRole)
    return { response: t(lang, "draftCmdUnknownRole", roleStr), error: true };

  const result = setRole(draft, players, player.userId, newRole);
  if ("message" in result && !("adjustedSlots" in result)) {
    // It's a ValidationError.
    const ve = result as ValidationError;
    return {
      response: t(
        lang,
        "draftCmdRoleError",
        lang === "zh" ? ve.messageZh : ve.message,
      ),
      error: true,
    };
  }

  const rc = result as { adjustedSlots?: string; adjustedSlotsZh?: string };
  const adjustmentNote = lang === "zh" ? rc.adjustedSlotsZh : rc.adjustedSlots;
  const roleName = lang === "zh" ? newRole.nameZh : newRole.name;
  return {
    response: lang === "zh"
      ? `✅ ${player.displayName} 将以 ${roleName} 之身降临。`
      : `✅ ${player.displayName} now walks as the ${roleName}.`,
    error: false,
    adjustmentNote,
  };
}

// ─── HERRING ──────────────────────────────────────────────────────────────────

function cmdHerring(
  line: string,
  draft: Draft,
  players: Player[],
  lang: Lang,
): CommandResult {
  const ftInPlay = [...draft.assignments.values()].some(
    (r) => r.id === "fortune_teller",
  );
  if (!ftInPlay)
    return { response: t(lang, "draftCmdHerringNoFT"), error: true };

  const playerName = line.trim().slice("HERRING".length).trim();
  if (!playerName)
    return { response: t(lang, "draftCmdHerringUsage"), error: true };

  const p = resolvePlayer(playerName, players);
  if (!p)
    return {
      response: t(lang, "draftCmdUnknownPlayer", playerName),
      error: true,
    };

  const role = draft.assignments.get(p.userId)!;
  if (role.category === "Demon" || role.category === "Minion") {
    return { response: t(lang, "draftCmdHerringNotGood"), error: true };
  }

  draft.redHerring = p.userId;
  return {
    response: lang === "zh"
      ? `✅ 迷途的气息将牵向 ${p.displayName}。`
      : `✅ The false trail leads to ${p.displayName}.`,
    error: false,
  };
}

// ─── DRUNK ────────────────────────────────────────────────────────────────────

function cmdDrunk(
  line: string,
  draft: Draft,
  players: Player[],
  lang: Lang,
): CommandResult {
  const drunkInPlay = [...draft.assignments.values()].some(
    (r) => r.id === "drunk",
  );
  if (!drunkInPlay)
    return { response: t(lang, "draftCmdDrunkNotInPlay"), error: true };

  const roleName = line.trim().slice("DRUNK".length).trim();
  if (!roleName)
    return { response: t(lang, "draftCmdDrunkUsage"), error: true };

  const role = findRole(roleName);
  if (!role)
    return { response: t(lang, "draftCmdUnknownRole", roleName), error: true };
  if (role.category !== "Townsfolk")
    return {
      response: t(lang, "draftCmdDrunkNotTownsfolk", roleName),
      error: true,
    };

  // Must not be a real player's role.
  const usedIds = new Set([...draft.assignments.values()].map((r) => r.id));
  if (usedIds.has(role.id))
    return {
      response: t(lang, "draftCmdDrunkAlreadyAssigned", roleName),
      error: true,
    };

  draft.drunkFakeRole = role;
  const rn = lang === "zh" ? role.nameZh : role.name;
  return {
    response: lang === "zh"
      ? `✅ 醉汉的幻象将是 ${rn}。`
      : `✅ The Drunk wanders under the guise of the ${rn}.`,
    error: false,
  };
}

// ─── BLUFF ────────────────────────────────────────────────────────────────────

function cmdBluff(
  line: string,
  draft: Draft,
  players: Player[],
  lang: Lang,
): CommandResult {
  const impInPlay = [...draft.assignments.values()].some((r) => r.id === "imp");
  if (!impInPlay)
    return { response: t(lang, "draftCmdBluffNoImp"), error: true };

  const rolePart = line.trim().slice("BLUFF".length).trim();
  const parts = rolePart
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== 3)
    return { response: t(lang, "draftCmdBluffUsage"), error: true };

  const usedIds = new Set([...draft.assignments.values()].map((r) => r.id));
  const resolved: Role[] = [];

  for (const part of parts) {
    const role = findRole(part);
    if (!role)
      return { response: t(lang, "draftCmdUnknownRole", part), error: true };
    if (role.category !== "Townsfolk")
      return {
        response: t(lang, "draftCmdBluffNotTownsfolk", part),
        error: true,
      };
    if (usedIds.has(role.id))
      return {
        response: t(lang, "draftCmdBluffAlreadyAssigned", part),
        error: true,
      };
    resolved.push(role);
  }

  if (new Set(resolved.map((r) => r.id)).size !== 3) {
    return { response: t(lang, "draftCmdBluffDuplicate"), error: true };
  }

  draft.impBluffs = [resolved[0], resolved[1], resolved[2]];
  const names = resolved
    .map((r) => (lang === "zh" ? r.nameZh : r.name))
    .join(lang === "zh" ? "、" : ", ");
  return {
    response: lang === "zh"
      ? `✅ 恶魔的面具已铸定：${names}。`
      : `✅ The Demon's masks are chosen: ${names}.`,
    error: false,
  };
}

// ─── Player resolver ──────────────────────────────────────────────────────────

/** Find a player by username or displayName (case-insensitive). */
function resolvePlayer(name: string, players: Player[]): Player | undefined {
  const lower = name.toLowerCase();
  const exact = players.filter(
    (p) =>
      p.username.toLowerCase() === lower ||
      p.displayName.toLowerCase() === lower,
  );
  if (exact.length === 1) return exact[0];

  // Prefix match.
  const prefix = players.filter(
    (p) =>
      p.username.toLowerCase().startsWith(lower) ||
      p.displayName.toLowerCase().startsWith(lower),
  );
  if (prefix.length === 1) return prefix[0];

  return undefined;
}
