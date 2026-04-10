import { Role, Draft, Player } from "./types";
import { getScript } from "./roles";
import { getDistribution, applyBaronAdjustment } from "./distribution";
import { roleParam } from "../i18n";

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle (in-place). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick `n` random unique items from `pool` without modifying it. */
function pick<T>(pool: T[], n: number): T[] {
  if (n > pool.length)
    throw new Error(`Cannot pick ${n} from pool of ${pool.length}`);
  return shuffle([...pool]).slice(0, n);
}

// ─── Assignment algorithm ─────────────────────────────────────────────────────

/**
 * Randomly generate a complete Draft for the given players.
 */
export function generateDraft(
  players: Player[],
): Draft {
  const script = getScript();
  const count = players.length;
  let dist = getDistribution(count);

  // 1. Pick minions first; check for Baron.
  const minions = pick(
    script.roles.filter((r) => r.category === "Minion"),
    dist.minions,
  );
  const baronInPlay = minions.some((r) => r.id === "baron");
  if (baronInPlay) {
    dist = applyBaronAdjustment(dist);
  }

  // 2. Pick townsfolk and outsiders using (adjusted) counts.
  const townsfolk = pick(
    script.roles.filter((r) => r.category === "Townsfolk"),
    dist.townsfolk,
  );
  const outsiders = pick(
    script.roles.filter((r) => r.category === "Outsider"),
    dist.outsiders,
  );
  const demon = script.roles.find((r) => r.category === "Demon")!; // Only the Imp in Trouble Brewing

  // 3. Combine all roles and shuffle; assign to players in order.
  const allRoles: Role[] = shuffle([
    ...townsfolk,
    ...outsiders,
    ...minions,
    demon,
  ]);
  const assignments = new Map<string, Role>();
  players.forEach((p, i) => assignments.set(p.userId, allRoles[i]));

  // 4. Drunk: pick a fake Townsfolk that is not already assigned to a real player.
  const drunkPlayer = players.find(
    (p) => assignments.get(p.userId)?.id === "drunk",
  );
  let drunkFakeRole: Role | null = null;
  if (drunkPlayer) {
    const assignedTfIds = new Set(
      [...assignments.values()]
        .filter((r) => r.category === "Townsfolk")
        .map((r) => r.id),
    );
    const eligible = script.roles.filter(
      (r) =>
        r.category === "Townsfolk" && !assignedTfIds.has(r.id),
    );
    drunkFakeRole = pick(eligible, 1)[0];
  }

  // 5. Imp bluffs: 3 good roles (Townsfolk or Outsider) not assigned to real players.
  //    Drunk's fake role IS eligible even if the real Townsfolk role is not in play.
  const impInPlay = [...assignments.values()].some((r) => r.id === "imp");
  let impBluffs: [Role, Role, Role] | null = null;
  if (impInPlay) {
    const usedIds = new Set([...assignments.values()].map((r) => r.id));
    const eligible = script.roles.filter(
      (r) =>
        (r.category === "Townsfolk" || r.category === "Outsider") &&
        !usedIds.has(r.id),
    );
    const chosen = pick(eligible, 3);
    impBluffs = [chosen[0], chosen[1], chosen[2]];
  }

  // 6. Red herring for Fortune Teller: any non-Demon Good player (randomly chosen).
  const ftInPlay = [...assignments.values()].some(
    (r) => r.id === "fortune_teller",
  );
  let redHerring: string | null = null;
  if (ftInPlay) {
    const goodNonDemon = players.filter((p) => {
      const role = assignments.get(p.userId);
      return role && role.category !== "Demon" && role.category !== "Minion";
    });
    redHerring = pick(goodNonDemon, 1)[0].userId;
  }

  return { assignments, drunkFakeRole, redHerring, impBluffs };
}

// ─── Draft validation ─────────────────────────────────────────────────────────

export interface ValidationError {
  key: string;
  params?: Record<string, string | number>;
}

export interface DraftReconcileResult {
  notes: Array<{ key: string; params?: Record<string, string | number> }>;
}

/**
 * Validate a Draft against distribution rules.
 * Returns null if valid, or a ValidationError describing the problem.
 */
export function validateDraft(
  draft: Draft,
  players: Player[],
): ValidationError | null {
  const roles = [...draft.assignments.values()];
  const count = players.length;

  // Check every player is assigned exactly one role.
  if (draft.assignments.size !== count) {
    return {
      key: "validErrCount",
      params: { expected: count, actual: draft.assignments.size },
    };
  }

  // No duplicate roles.
  const ids = roles.map((r) => r.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    return { key: "validErrDuplicate" };
  }

  // Count by category.
  const tf = roles.filter((r) => r.category === "Townsfolk").length;
  const os = roles.filter((r) => r.category === "Outsider").length;
  const mn = roles.filter((r) => r.category === "Minion").length;
  const dm = roles.filter((r) => r.category === "Demon").length;

  if (dm !== 1) {
    return { key: "validErrDemonCount" };
  }
  if (mn < 1) {
    return { key: "validErrMinionMin" };
  }

  // Determine expected distribution (with Baron adjustment if needed).
  let dist = getDistribution(count);
  const baronInPlay = roles.some((r) => r.id === "baron");
  if (baronInPlay) dist = applyBaronAdjustment(dist);

  if (mn !== dist.minions) {
    return {
      key: "validErrMinionCount",
      params: { expected: dist.minions, actual: mn },
    };
  }
  if (tf !== dist.townsfolk) {
    return {
      key: "validErrTownsfolkCount",
      params: { expected: dist.townsfolk, actual: tf },
    };
  }
  if (os !== dist.outsiders) {
    return {
      key: "validErrOutsiderCount",
      params: { expected: dist.outsiders, actual: os },
    };
  }

  // Drunk: must have a fake role assigned.
  const drunkInPlay = roles.some((r) => r.id === "drunk");
  if (drunkInPlay && !draft.drunkFakeRole) {
    return { key: "validErrDrunkNoFake" };
  }
  if (drunkInPlay && draft.drunkFakeRole) {
    // Fake role must be Townsfolk.
    if (draft.drunkFakeRole.category !== "Townsfolk") {
      return { key: "validErrDrunkFakeMustBeTownsfolk" };
    }
    if (uniqueIds.has(draft.drunkFakeRole.id)) {
      return { key: "validErrDrunkFakeOverlap" };
    }
  }

  // Fortune Teller: must have a red herring.
  const ftInPlay = roles.some((r) => r.id === "fortune_teller");
  if (ftInPlay && !draft.redHerring) {
    return { key: "validErrFtNoHerring" };
  }
  if (draft.redHerring) {
    const rh = draft.assignments.get(draft.redHerring);
    if (!rh || rh.category === "Demon" || rh.category === "Minion") {
      return { key: "validErrHerringNotGood" };
    }
  }

  // Imp bluffs: must be 3 good roles (Townsfolk or Outsider) not in real assignments.
  const impInPlay = roles.some((r) => r.id === "imp");
  if (impInPlay && !draft.impBluffs) {
    return { key: "validErrImpNoBluffs" };
  }
  if (draft.impBluffs) {
    for (const bluff of draft.impBluffs) {
      if (bluff.category !== "Townsfolk" && bluff.category !== "Outsider") {
        return {
          key: "validErrBluffNotGood",
          params: { role: roleParam(bluff.id) },
        };
      }
      if (uniqueIds.has(bluff.id)) {
        return {
          key: "validErrBluffAssigned",
          params: { role: roleParam(bluff.id) },
        };
      }
    }
    const bluffIds = draft.impBluffs.map((b) => b.id);
    if (new Set(bluffIds).size !== 3) {
      return { key: "validErrBluffNotDistinct" };
    }
  }

  return null;
}

// ─── Draft editing helpers ────────────────────────────────────────────────────

/** Swap the roles of two players (always valid). */
export function swapRoles(
  draft: Draft,
  userId1: string,
  userId2: string,
): void {
  const r1 = draft.assignments.get(userId1)!;
  const r2 = draft.assignments.get(userId2)!;
  draft.assignments.set(userId1, r2);
  draft.assignments.set(userId2, r1);
}

export interface RoleChangeResult {
  adjustedSlots?: { key: string; params?: Record<string, string | number> };
  newPlayers?: Array<{ userId: string; newRole: Role }>;
}

/**
 * Replace a player's role with a new one, enforcing same-category rule
 * and handling the Baron special case.
 * Returns an error string on failure, or a RoleChangeResult on success.
 */
export function setRole(
  draft: Draft,
  players: Player[],
  targetUserId: string,
  newRole: Role,
): RoleChangeResult | ValidationError {
  const currentRole = draft.assignments.get(targetUserId);
  if (!currentRole) {
    return { key: "validErrPlayerNotFound" };
  }

  const baronCurrentlyInPlay = [...draft.assignments.values()].some(
    (r) => r.id === "baron",
  );
  const newRoleIsBaron = newRole.id === "baron";
  const currentRoleIsBaron = currentRole.id === "baron";

  // Baron special cases.
  if (newRoleIsBaron && !baronCurrentlyInPlay) {
    // Adding Baron: must be replacing a Minion.
    if (currentRole.category !== "Minion") {
      return {
        key: "validErrBaronNotMinion",
        params: { role: roleParam(currentRole.id) },
      };
    }
    // Replace this minion with Baron.
    draft.assignments.set(targetUserId, newRole);
    // Auto-adjust: replace 2 random Townsfolk with 2 random Outsiders.
    return autoAdjustForBaronAdded(draft, players);
  }

  if (currentRoleIsBaron && !newRoleIsBaron && newRole.category === "Minion") {
    // Removing Baron: replace with another Minion.
    draft.assignments.set(targetUserId, newRole);
    // Auto-adjust: replace 2 random Outsiders with 2 random Townsfolk.
    return autoAdjustForBaronRemoved(draft, players);
  }

  // Normal case: must be same category.
  if (currentRole.category !== newRole.category) {
    return {
      key: "validErrCategoryMismatch",
      params: {
        current: roleParam(currentRole.id),
        currentCat: currentRole.category,
        new: roleParam(newRole.id),
        newCat: newRole.category,
      },
    };
  }

  // Prevent duplicates.
  const alreadyAssigned = [...draft.assignments.entries()].find(
    ([uid, r]) => r.id === newRole.id && uid !== targetUserId,
  );
  if (alreadyAssigned) {
    return {
      key: "validErrRoleAssigned",
      params: { role: roleParam(newRole.id) },
    };
  }

  draft.assignments.set(targetUserId, newRole);
  return {};
}

/**
 * Reconcile derived draft fields after role mutations.
 * Auto-fixes Red Herring, Drunk fake role, and Imp bluffs when they become invalid.
 */
export function reconcileDraftDependencies(
  draft: Draft,
  players: Player[],
): DraftReconcileResult {
  const script = getScript();
  const notes: Array<{
    key: string;
    params?: Record<string, string | number>;
  }> = [];
  const roles = [...draft.assignments.values()];
  const usedIds = new Set(roles.map((r) => r.id));

  const drunkInPlay = roles.some((r) => r.id === "drunk");
  if (!drunkInPlay && draft.drunkFakeRole) {
    draft.drunkFakeRole = null;
    notes.push({ key: "noteClearedDrunkFake" });
  }
  if (drunkInPlay) {
    const fake = draft.drunkFakeRole;
    const fakeValid =
      !!fake &&
      fake.category === "Townsfolk" &&
      !usedIds.has(fake.id);
    if (!fakeValid) {
      const eligible = script.roles.filter(
        (r) =>
          r.category === "Townsfolk" && !usedIds.has(r.id),
      );
      if (eligible.length > 0) {
        const picked = pick(eligible, 1)[0];
        draft.drunkFakeRole = picked;
        notes.push({
          key: "noteAutoSetDrunkFake",
          params: { role: roleParam(picked.id) },
        });
      }
    }
  }

  const ftInPlay = roles.some((r) => r.id === "fortune_teller");
  if (!ftInPlay && draft.redHerring) {
    draft.redHerring = null;
    notes.push({ key: "noteClearedRedHerring" });
  }
  if (ftInPlay) {
    const rhRole = draft.redHerring
      ? draft.assignments.get(draft.redHerring)
      : null;
    const herringValid =
      !!rhRole && rhRole.category !== "Demon" && rhRole.category !== "Minion";
    if (!herringValid) {
      const eligible = players.filter((p) => {
        const role = draft.assignments.get(p.userId);
        return role && role.category !== "Demon" && role.category !== "Minion";
      });
      if (eligible.length > 0) {
        const chosen = pick(eligible, 1)[0];
        draft.redHerring = chosen.userId;
        notes.push({
          key: "noteAutoSetRedHerring",
          params: { player: chosen.displayName },
        });
      }
    }
  }

  const impInPlay = roles.some((r) => r.id === "imp");
  if (!impInPlay && draft.impBluffs) {
    draft.impBluffs = null;
    notes.push({ key: "noteClearedImpBluffs" });
  }
  if (impInPlay) {
    const bluffs = draft.impBluffs;
    const bluffValid =
      !!bluffs &&
      bluffs.length === 3 &&
      new Set(bluffs.map((b) => b.id)).size === 3 &&
      bluffs.every(
        (b) =>
          (b.category === "Townsfolk" || b.category === "Outsider") &&
          !usedIds.has(b.id) &&
          script.roles.some((r) => r.id === b.id),
      );
    if (!bluffValid) {
      const eligible = script.roles.filter(
        (r) =>
          (r.category === "Townsfolk" || r.category === "Outsider") &&
          !usedIds.has(r.id),
      );
      if (eligible.length >= 3) {
        const picked = pick(eligible, 3);
        draft.impBluffs = [picked[0], picked[1], picked[2]];
        notes.push({
          key: "noteAutoSetImpBluffs",
          params: {
            roles: `${roleParam(picked[0].id)}, ${roleParam(picked[1].id)}, ${roleParam(picked[2].id)}`,
          },
        });
      }
    }
  }

  return { notes };
}

function autoAdjustForBaronAdded(
  draft: Draft,
  players: Player[],
): RoleChangeResult {
  const script = getScript();
  const usedIds = new Set([...draft.assignments.values()].map((r) => r.id));
  const tfPlayers = players.filter(
    (p) => draft.assignments.get(p.userId)?.category === "Townsfolk",
  );
  const availableOutsiders = script.roles.filter(
    (r) => r.category === "Outsider" && !usedIds.has(r.id),
  );

  const chosen = pick(tfPlayers, Math.min(2, tfPlayers.length));
  const newOutsiders = pick(
    availableOutsiders,
    Math.min(2, availableOutsiders.length),
  );
  const changed: Array<{ userId: string; newRole: Role }> = [];

  chosen.forEach((p, i) => {
    if (newOutsiders[i]) {
      draft.assignments.set(p.userId, newOutsiders[i]);
      changed.push({ userId: p.userId, newRole: newOutsiders[i] });
    }
  });

  const desc = changed
    .map((c) => {
      const p = players.find((pl) => pl.userId === c.userId)!;
      return `${p.displayName} → ${roleParam(c.newRole.id)}`;
    })
    .join(", ");

  return {
    adjustedSlots: { key: "noteBaronAdded", params: { desc } },
    newPlayers: changed,
  };
}

function autoAdjustForBaronRemoved(
  draft: Draft,
  players: Player[],
): RoleChangeResult {
  const script = getScript();
  const usedIds = new Set([...draft.assignments.values()].map((r) => r.id));
  const osPlayers = players.filter(
    (p) => draft.assignments.get(p.userId)?.category === "Outsider",
  );
  const availableTf = script.roles.filter(
    (r) => r.category === "Townsfolk" && !usedIds.has(r.id),
  );

  const chosen = pick(osPlayers, Math.min(2, osPlayers.length));
  const newTf = pick(availableTf, Math.min(2, availableTf.length));
  const changed: Array<{ userId: string; newRole: Role }> = [];

  chosen.forEach((p, i) => {
    if (newTf[i]) {
      draft.assignments.set(p.userId, newTf[i]);
      changed.push({ userId: p.userId, newRole: newTf[i] });
    }
  });

  const desc = changed
    .map((c) => {
      const p = players.find((pl) => pl.userId === c.userId)!;
      return `${p.displayName} → ${roleParam(c.newRole.id)}`;
    })
    .join(", ");

  return {
    adjustedSlots: { key: "noteBaronRemoved", params: { desc } },
    newPlayers: changed,
  };
}
