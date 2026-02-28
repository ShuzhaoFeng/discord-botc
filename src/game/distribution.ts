/** Role-count distribution table per player count. */
export interface Distribution {
  townsfolk: number;
  outsiders: number;
  minions: number;
  demon: number;
}

const TABLE: Record<number, Distribution> = {
  5:  { townsfolk: 3, outsiders: 0, minions: 1, demon: 1 },
  6:  { townsfolk: 4, outsiders: 0, minions: 1, demon: 1 },
  7:  { townsfolk: 5, outsiders: 0, minions: 1, demon: 1 },
  8:  { townsfolk: 5, outsiders: 1, minions: 1, demon: 1 },
  9:  { townsfolk: 5, outsiders: 2, minions: 1, demon: 1 },
  10: { townsfolk: 7, outsiders: 0, minions: 2, demon: 1 },
  11: { townsfolk: 7, outsiders: 1, minions: 2, demon: 1 },
  12: { townsfolk: 7, outsiders: 2, minions: 2, demon: 1 },
  13: { townsfolk: 9, outsiders: 0, minions: 3, demon: 1 },
  14: { townsfolk: 9, outsiders: 1, minions: 3, demon: 1 },
  15: { townsfolk: 9, outsiders: 2, minions: 3, demon: 1 },
};

/**
 * Returns the base distribution for a given player count (5–15).
 * Throws if player count is out of range.
 */
export function getDistribution(playerCount: number): Distribution {
  const dist = TABLE[playerCount];
  if (!dist) throw new RangeError(`No distribution for ${playerCount} players`);
  return { ...dist };
}

/** Apply Baron adjustment: +2 outsiders, -2 townsfolk. */
export function applyBaronAdjustment(dist: Distribution): Distribution {
  return {
    ...dist,
    townsfolk: dist.townsfolk - 2,
    outsiders: dist.outsiders + 2,
  };
}
