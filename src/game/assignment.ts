import { Role, Draft, Player } from "./types";
import { TOWNSFOLK, OUTSIDERS, MINIONS, DEMONS, ROLE_BY_ID } from "./roles";
import { getDistribution, applyBaronAdjustment } from "./distribution";

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
 * Implements the algorithm from AGENTS.md §Assignment Algorithm.
 */
export function generateDraft(players: Player[]): Draft {
  const count = players.length;
  let dist = getDistribution(count);

  // 1. Pick minions first; check for Baron.
  const minions = pick(MINIONS, dist.minions);
  const baronInPlay = minions.some((r) => r.id === "baron");
  if (baronInPlay) {
    dist = applyBaronAdjustment(dist);
  }

  // 2. Pick townsfolk and outsiders using (adjusted) counts.
  const townsfolk = pick(TOWNSFOLK, dist.townsfolk);
  const outsiders = pick(OUTSIDERS, dist.outsiders);
  const demon = DEMONS[0]; // Only the Imp in Trouble Brewing

  // 3. Combine all roles and shuffle; assign to players in order.
  const allRoles: Role[] = shuffle([
    ...townsfolk,
    ...outsiders,
    ...minions,
    demon,
  ]);
  const assignments = new Map<string, Role>();
  players.forEach((p, i) => assignments.set(p.userId, allRoles[i]));

  // 4. Drunk: pick a fake Townsfolk not already in real assignments.
  const drunkPlayer = players.find(
    (p) => assignments.get(p.userId)?.id === "drunk",
  );
  let drunkFakeRole: Role | null = null;
  if (drunkPlayer) {
    const usedIds = new Set([...assignments.values()].map((r) => r.id));
    const eligible = TOWNSFOLK.filter((r) => !usedIds.has(r.id));
    drunkFakeRole = pick(eligible, 1)[0];
  }

  // 5. Imp bluffs: 3 Townsfolk not assigned to real players.
  //    Drunk's fake role IS eligible even if the real Townsfolk role is not in play.
  const impInPlay = [...assignments.values()].some((r) => r.id === "imp");
  let impBluffs: [Role, Role, Role] | null = null;
  if (impInPlay) {
    const usedIds = new Set([...assignments.values()].map((r) => r.id));
    // Remove drunk's real role from used; add fake role's id to used so it counts as "in play"
    // Per spec: Drunk's fake role is eligible (i.e., not blocked from bluffs).
    const eligible = TOWNSFOLK.filter((r) => !usedIds.has(r.id));
    // If drunkFakeRole exists, it might already be excluded as a real assignment? No —
    // drunkFakeRole.id is NOT in assignments (that's how it was chosen). So it's already in `eligible`.
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
  message: string;
  messageZh: string;
}

export interface DraftReconcileResult {
  adjustmentNote?: string;
  adjustmentNoteZh?: string;
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
      message: `Expected ${count} role assignments, got ${draft.assignments.size}.`,
      messageZh: `应有 ${count} 个角色分配，实际有 ${draft.assignments.size} 个。`,
    };
  }

  // No duplicate roles.
  const ids = roles.map((r) => r.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    return {
      message: "Duplicate roles detected.",
      messageZh: "检测到重复角色。",
    };
  }

  // Count by category.
  const tf = roles.filter((r) => r.category === "Townsfolk").length;
  const os = roles.filter((r) => r.category === "Outsider").length;
  const mn = roles.filter((r) => r.category === "Minion").length;
  const dm = roles.filter((r) => r.category === "Demon").length;

  if (dm !== 1) {
    return {
      message: "There must be exactly 1 Demon.",
      messageZh: "必须恰好有1个恶魔。",
    };
  }
  if (mn < 1) {
    return {
      message: "There must be at least 1 Minion.",
      messageZh: "必须至少有1个爪牙。",
    };
  }

  // Determine expected distribution (with Baron adjustment if needed).
  let dist = getDistribution(count);
  const baronInPlay = roles.some((r) => r.id === "baron");
  if (baronInPlay) dist = applyBaronAdjustment(dist);

  if (mn !== dist.minions) {
    return {
      message: `Expected ${dist.minions} Minion(s), got ${mn}.`,
      messageZh: `爪牙数量应为 ${dist.minions}，实际为 ${mn}。`,
    };
  }
  if (tf !== dist.townsfolk) {
    return {
      message: `Expected ${dist.townsfolk} Townsfolk, got ${tf}.`,
      messageZh: `镇民数量应为 ${dist.townsfolk}，实际为 ${tf}。`,
    };
  }
  if (os !== dist.outsiders) {
    return {
      message: `Expected ${dist.outsiders} Outsider(s), got ${os}.`,
      messageZh: `外来者数量应为 ${dist.outsiders}，实际为 ${os}。`,
    };
  }

  // Drunk: must have a fake role assigned.
  const drunkInPlay = roles.some((r) => r.id === "drunk");
  if (drunkInPlay && !draft.drunkFakeRole) {
    return {
      message: "Drunk is in play but has no fake role assigned.",
      messageZh: "酒鬼在局中但未分配虚假身份。",
    };
  }
  if (drunkInPlay && draft.drunkFakeRole) {
    // Fake role must be Townsfolk and not in real assignments.
    if (draft.drunkFakeRole.category !== "Townsfolk") {
      return {
        message: "Drunk's fake role must be a Townsfolk.",
        messageZh: "酒鬼的虚假身份必须是镇民。",
      };
    }
    if (uniqueIds.has(draft.drunkFakeRole.id)) {
      return {
        message: `Drunk's fake role (${draft.drunkFakeRole.name}) is already assigned to a real player.`,
        messageZh: `酒鬼的虚假身份（${draft.drunkFakeRole.nameZh}）已被分配给真实玩家。`,
      };
    }
  }

  // Fortune Teller: must have a red herring.
  const ftInPlay = roles.some((r) => r.id === "fortune_teller");
  if (ftInPlay && !draft.redHerring) {
    return {
      message: "Fortune Teller is in play but no Red Herring is designated.",
      messageZh: "占卜师在局中但未指定红鲱鱼。",
    };
  }
  if (draft.redHerring) {
    const rh = draft.assignments.get(draft.redHerring);
    if (!rh || rh.category === "Demon" || rh.category === "Minion") {
      return {
        message: "Red Herring must be a non-Demon Good player.",
        messageZh: "红鲱鱼必须是非恶魔的善良玩家。",
      };
    }
  }

  // Imp bluffs: must be 3 Townsfolk not in real assignments.
  const impInPlay = roles.some((r) => r.id === "imp");
  if (impInPlay && !draft.impBluffs) {
    return {
      message: "Imp is in play but no bluff roles are set.",
      messageZh: "小恶魔在局中但未设置虚张声势角色。",
    };
  }
  if (draft.impBluffs) {
    for (const bluff of draft.impBluffs) {
      if (bluff.category !== "Townsfolk") {
        return {
          message: `Bluff role ${bluff.name} is not a Townsfolk.`,
          messageZh: `虚张声势角色 ${bluff.nameZh} 不是镇民。`,
        };
      }
      if (uniqueIds.has(bluff.id)) {
        return {
          message: `Bluff role ${bluff.name} is already assigned to a real player.`,
          messageZh: `虚张声势角色 ${bluff.nameZh} 已被分配给真实玩家。`,
        };
      }
    }
    const bluffIds = draft.impBluffs.map((b) => b.id);
    if (new Set(bluffIds).size !== 3) {
      return {
        message: "Imp bluff roles must be 3 distinct roles.",
        messageZh: "小恶魔的虚张声势角色必须是3个不同的角色。",
      };
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
  adjustedSlots?: string; // description of auto-adjusted slots for Baron changes
  adjustedSlotsZh?: string;
  newPlayers?: Array<{ userId: string; newRole: Role }>; // auto-changed players
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
    return { message: "Player not found.", messageZh: "未找到该玩家。" };
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
        message: `Cannot assign Baron to a non-Minion slot (current role: ${currentRole.name}).`,
        messageZh: `不能将男爵分配给非爪牙位置（当前角色：${currentRole.nameZh}）。`,
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
      message: `Cannot change ${currentRole.name} [${currentRole.category}] to ${newRole.name} [${newRole.category}] — different categories.`,
      messageZh: `不能将 ${currentRole.nameZh}【${categoryZh(currentRole.category)}】改为 ${newRole.nameZh}【${categoryZh(newRole.category)}】——类别不同。`,
    };
  }

  // Prevent duplicates.
  const alreadyAssigned = [...draft.assignments.entries()].find(
    ([uid, r]) => r.id === newRole.id && uid !== targetUserId,
  );
  if (alreadyAssigned) {
    return {
      message: `${newRole.name} is already assigned to another player.`,
      messageZh: `${newRole.nameZh} 已被分配给其他玩家。`,
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
  const notes: string[] = [];
  const notesZh: string[] = [];
  const roles = [...draft.assignments.values()];
  const usedIds = new Set(roles.map((r) => r.id));

  const drunkInPlay = roles.some((r) => r.id === "drunk");
  if (!drunkInPlay && draft.drunkFakeRole) {
    draft.drunkFakeRole = null;
    notes.push("Auto-cleared Drunk fake role (Drunk not in play).");
    notesZh.push("已自动清除酒鬼虚假身份（酒鬼不在局中）。");
  }
  if (drunkInPlay) {
    const fake = draft.drunkFakeRole;
    const fakeValid =
      !!fake && fake.category === "Townsfolk" && !usedIds.has(fake.id);
    if (!fakeValid) {
      const eligible = TOWNSFOLK.filter((r) => !usedIds.has(r.id));
      if (eligible.length > 0) {
        const picked = pick(eligible, 1)[0];
        draft.drunkFakeRole = picked;
        notes.push(`Auto-set Drunk fake role: ${picked.name}`);
        notesZh.push(`已自动设置酒鬼虚假身份：${picked.nameZh}`);
      }
    }
  }

  const ftInPlay = roles.some((r) => r.id === "fortune_teller");
  if (!ftInPlay && draft.redHerring) {
    draft.redHerring = null;
    notes.push("Auto-cleared Red Herring (Fortune Teller not in play).");
    notesZh.push("已自动清除红鲱鱼（占卜师不在局中）。");
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
        notes.push(`Auto-set Red Herring: ${chosen.displayName}`);
        notesZh.push(`已自动设置红鲱鱼：${chosen.displayName}`);
      }
    }
  }

  const impInPlay = roles.some((r) => r.id === "imp");
  if (!impInPlay && draft.impBluffs) {
    draft.impBluffs = null;
    notes.push("Auto-cleared Imp bluffs (Imp not in play).");
    notesZh.push("已自动清除小恶魔虚张声势角色（小恶魔不在局中）。");
  }
  if (impInPlay) {
    const bluffs = draft.impBluffs;
    const bluffValid =
      !!bluffs &&
      bluffs.length === 3 &&
      new Set(bluffs.map((b) => b.id)).size === 3 &&
      bluffs.every(
        (b) =>
          b.category === "Townsfolk" &&
          !usedIds.has(b.id) &&
          !!ROLE_BY_ID.get(b.id),
      );
    if (!bluffValid) {
      const eligible = TOWNSFOLK.filter((r) => !usedIds.has(r.id));
      if (eligible.length >= 3) {
        const picked = pick(eligible, 3);
        draft.impBluffs = [picked[0], picked[1], picked[2]];
        notes.push(
          `Auto-set Imp bluffs: ${picked[0].name}, ${picked[1].name}, ${picked[2].name}`,
        );
        notesZh.push(
          `已自动设置小恶魔虚张声势角色：${picked[0].nameZh}、${picked[1].nameZh}、${picked[2].nameZh}`,
        );
      }
    }
  }

  return {
    adjustmentNote: notes.length > 0 ? notes.join("\n") : undefined,
    adjustmentNoteZh: notesZh.length > 0 ? notesZh.join("\n") : undefined,
  };
}

function autoAdjustForBaronAdded(
  draft: Draft,
  players: Player[],
): RoleChangeResult {
  const usedIds = new Set([...draft.assignments.values()].map((r) => r.id));
  const tfPlayers = players.filter(
    (p) => draft.assignments.get(p.userId)?.category === "Townsfolk",
  );
  const availableOutsiders = OUTSIDERS.filter((r) => !usedIds.has(r.id));

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
      return `${p.displayName} → ${c.newRole.name}`;
    })
    .join(", ");
  const descZh = changed
    .map((c) => {
      const p = players.find((pl) => pl.userId === c.userId)!;
      return `${p.displayName} → ${c.newRole.nameZh}`;
    })
    .join("，");

  return {
    adjustedSlots: `Auto-adjusted for Baron (+2 Outsiders): ${desc}`,
    adjustedSlotsZh: `男爵自动调整（+2外来者）：${descZh}`,
    newPlayers: changed,
  };
}

function autoAdjustForBaronRemoved(
  draft: Draft,
  players: Player[],
): RoleChangeResult {
  const usedIds = new Set([...draft.assignments.values()].map((r) => r.id));
  const osPlayers = players.filter(
    (p) => draft.assignments.get(p.userId)?.category === "Outsider",
  );
  const availableTf = TOWNSFOLK.filter((r) => !usedIds.has(r.id));

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
      return `${p.displayName} → ${c.newRole.name}`;
    })
    .join(", ");
  const descZh = changed
    .map((c) => {
      const p = players.find((pl) => pl.userId === c.userId)!;
      return `${p.displayName} → ${c.newRole.nameZh}`;
    })
    .join("，");

  return {
    adjustedSlots: `Auto-adjusted for Baron removal (-2 Outsiders): ${desc}`,
    adjustedSlotsZh: `男爵移除自动调整（-2外来者）：${descZh}`,
    newPlayers: changed,
  };
}

function categoryZh(cat: string): string {
  switch (cat) {
    case "Townsfolk":
      return "镇民";
    case "Outsider":
      return "外来者";
    case "Minion":
      return "爪牙";
    case "Demon":
      return "恶魔";
    default:
      return cat;
  }
}
