/**
 * Pure runtime utility helpers shared between game/night.ts and role handlers.
 * This file must NOT import from roles/ or scripts/ to avoid circular dependencies.
 */

import {
  GameState,
  Lang,
  Player,
  PlayerRuntimeState,
  Role,
  RuntimeState,
} from "./types";
import { getLang } from "../i18n";

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

/** True if this role registers as Townsfolk to Townsfolk-detection abilities. */
export function registersAsTownsfolkForDetection(role: Role): boolean {
  if (role.id === "spy") return Math.random() < 0.5;
  return role.category === "Townsfolk";
}

/** True if this role registers as Outsider to Outsider-detection abilities. */
export function registersAsOutsiderForDetection(role: Role): boolean {
  if (role.id === "recluse") return Math.random() < 0.5;
  if (role.id === "spy") return Math.random() < 0.5;
  return role.category === "Outsider";
}

/** True if this role registers as Minion to Minion-detection abilities. */
export function registersAsMinionForDetection(role: Role): boolean {
  if (role.id === "recluse") return Math.random() < 0.5;
  if (role.id === "spy") return Math.random() < 0.5;
  return role.category === "Minion";
}

/** True if this role registers as evil to alignment-detection abilities. */
export function registersAsEvilForDetection(role: Role): boolean {
  if (role.id === "recluse") return Math.random() < 0.5;
  if (role.id === "spy") return Math.random() < 0.5;
  return role.category === "Minion" || role.category === "Demon";
}

/** True if this role registers as Demon to Demon-detection abilities. */
export function registersAsDemonForDetection(role: Role): boolean {
  if (role.id === "recluse") return Math.random() < 0.5;
  return role.category === "Demon";
}

export function resolvePlayer(
  name: string,
  players: Player[],
): Player | undefined {
  const lower = name.toLowerCase().trim();
  const exact = players.filter(
    (p) =>
      p.displayName.toLowerCase() === lower ||
      p.username.toLowerCase() === lower,
  );
  if (exact.length === 1) return exact[0];
  const prefix = players.filter(
    (p) =>
      p.displayName.toLowerCase().startsWith(lower) ||
      p.username.toLowerCase().startsWith(lower),
  );
  if (prefix.length === 1) return prefix[0];
  return undefined;
}

/** Derives the display language from the first player in the game. */
export function channelLang(state: GameState): Lang {
  return getLang(state.players[0]?.userId ?? "", state.guildId);
}
