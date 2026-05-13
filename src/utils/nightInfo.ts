import type {
  NightOutcomeDraft,
  NightOutcomeFieldType,
  Player,
  Role,
  RuntimeState,
} from "../game/types";
import { pick, shuffle } from "./random";
import { getPlayerState, hasFalsifiedInfo } from "./runtime";
import { registersAs } from "./roleDetection";

interface DecoyPairOpts {
  runtime: RuntimeState;
  playerId: string;
  scriptRoles: readonly Role[];
  /** Category the role detects (Washerwoman → Townsfolk, etc.). */
  category: "Townsfolk" | "Outsider" | "Minion";
  /** Reason key shown to the storyteller when info is real (not falsified). */
  reasonKey: string;
  /**
   * When true, return null if no player registers as `category` AND info is
   * not falsified. Used by Librarian for the "no Outsiders" case.
   */
  nullWhenNoCandidates?: boolean;
}

/**
 * The "these two, one of them is a {role}" info shared by Washerwoman,
 * Librarian, and Investigator. The role field is editable by the storyteller
 * only when the info is falsified.
 */
export function buildDecoyPairInfo(
  opts: DecoyPairOpts,
): NightOutcomeDraft | null {
  const {
    runtime,
    playerId,
    scriptRoles,
    category,
    reasonKey,
    nullWhenNoCandidates,
  } = opts;

  const selfPs = getPlayerState(runtime, playerId);
  const falsified = hasFalsifiedInfo(selfPs);
  const players = runtime.playerStates.map((ps) => ps.player);
  const categoryRoles = scriptRoles.filter((r) => r.category === category);

  const realCandidates = runtime.playerStates.flatMap((candidatePs) => {
    if (candidatePs.role.category === category) {
      return [{ player: candidatePs.player, roleId: candidatePs.role.id }];
    }
    if (registersAs(candidatePs.role, category)) {
      const fake = pick(categoryRoles, 1)[0];
      return fake ? [{ player: candidatePs.player, roleId: fake.id }] : [];
    }
    return [];
  });

  if (!falsified && nullWhenNoCandidates && realCandidates.length === 0) {
    return null;
  }

  const otherPlayers = falsified
    ? players.filter((p) => p.userId !== playerId)
    : players;
  const realTarget = pick(realCandidates, 1)[0];
  const targetPlayer = falsified
    ? pick(otherPlayers, 1)[0]
    : realTarget?.player;

  const fallbackRoleId = selfPs?.effectiveRole.id ?? playerId;
  const roleId = falsified
    ? (pick(categoryRoles, 1)[0]?.id ?? fallbackRoleId)
    : realTarget
      ? realTarget.roleId
      : fallbackRoleId;

  const decoy = pick(
    otherPlayers.filter((p) => p.userId !== targetPlayer?.userId),
    1,
  )[0];

  const two = shuffle(
    [targetPlayer, decoy].filter((x): x is Player => !!x),
  );

  const fieldTypes: Record<string, NightOutcomeFieldType> = falsified
    ? { p1: "player", p2: "player", role: "role" }
    : { p1: "player", p2: "player" };

  return {
    templateId: "pair_role_info",
    fields: {
      p1: two[0]?.userId ?? playerId,
      p2: two[1]?.userId ?? playerId,
      role: roleId,
    },
    fieldTypes,
    constraints: { pairCategory: category },
    allowArbitraryOverride: falsified,
    reasonKey: falsified ? "nightReasonFalseInfo" : reasonKey,
  };
}
