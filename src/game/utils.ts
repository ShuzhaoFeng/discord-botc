/**
 * Pure runtime utility helpers shared between game/night.ts and role handlers.
 * This file must NOT import from roles/ or scripts/ to avoid circular dependencies.
 */

import { Client } from "discord.js";
import {
  GameState,
  Lang,
  Player,
  PlayerRuntimeState,
  PlayerTag,
  Role,
  RuntimeState,
} from "./types";
import { getLang } from "../i18n";
import { getGuildSettings } from "../guild-settings";

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

export function ensureRuntime(state: GameState): RuntimeState {
  if (!state.runtime) {
    const draft = state.draft!;
    const playerStates: PlayerRuntimeState[] = state.players.map((p) => {
      const role = draft.assignments.get(p.userId)!;
      const effectiveRole =
        role.id === "drunk" && draft.drunkFakeRole ? draft.drunkFakeRole : role;
      const tags = new Set<PlayerTag>();
      if (draft.redHerring === p.userId) tags.add("red_herring");
      return { player: p, role, effectiveRole, alive: true, tags };
    });
    state.runtime = {
      nightNumber: 0,
      playerStates,
      nightSession: null,
      daySession: null,
      lastExecutedPlayerId: null,
      nightKillIds: [],
      nightKillIntentId: null,
      pendingEndGame: null,
    };
  }
  return state.runtime;
}

export function getAlivePlayers(state: GameState): Player[] {
  const runtime = ensureRuntime(state);
  return runtime.playerStates.filter((ps) => ps.alive).map((ps) => ps.player);
}

export function playerDisplayName(state: GameState, userId: string): string {
  return state.players.find((p) => p.userId === userId)?.displayName ?? userId;
}

/** Send a DM notification to the storyteller (non-blocking, best-effort). */
export function notifyStoryteller(
  client: Client,
  state: GameState,
  content: string,
): void {
  if (!state.storytellerId) return;
  client.users
    .fetch(state.storytellerId)
    .then((u) => u.send(content))
    .catch(() => {});
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

/**
 * True when in-game shared channel commands (/nominate, /ye, /endday, role
 * commands like /slay) should be silently ignored.
 *
 * This happens when:
 *  - A human storyteller is running the game (manual mode), AND
 *  - Townsquare integration is enabled for the guild.
 *
 * In that scenario the storyteller drives the entire day flow via the
 * townsquare app, so Discord day-phase commands are unnecessary.
 */
export function areChannelCommandsDisabled(state: GameState): boolean {
  return (
    state.storytellerId !== null &&
    getGuildSettings(state.guildId).townsquareUrl !== null
  );
}
