import type { PlayerRuntimeState, Role, RuntimeState } from "../game/types";

export function getPlayerState(
  runtime: RuntimeState,
  userId: string,
): PlayerRuntimeState | undefined {
  return runtime.playerStates.find((ps) => ps.player.userId === userId);
}

export function getRole(runtime: RuntimeState, playerId: string): Role {
  return getPlayerState(runtime, playerId)!.role;
}

export function isEvil(role: Role): boolean {
  return role.category === "Minion" || role.category === "Demon";
}

/**
 * True when a player should receive false or randomized info this night:
 * Drunks (no real ability) and poisoned players (ability suppressed).
 */
export function hasFalsifiedInfo(ps: PlayerRuntimeState | undefined): boolean {
  if (!ps) return false;
  return ps.role.id === "drunk" || ps.tags.has("poisoned");
}
