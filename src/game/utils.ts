/**
 * Pure runtime utility helpers shared between game/night.ts and role handlers.
 * This file must NOT import from roles/ or scripts/ to avoid circular dependencies.
 */

import { PlayerRuntimeState, Role, RuntimeState } from "./types";

export function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function pick<T>(arr: T[], n: number): T[] {
  if (n <= 0) return [];
  return shuffle(arr).slice(0, n);
}

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
