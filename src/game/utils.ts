/**
 * Game-level helpers that need i18n, guild settings, or Discord.js. Pure
 * helpers live in `src/utils/` and are re-exported below.
 *
 * Must not import from roles/ or scripts/ — they import this transitively.
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
import { getGuildSettings } from "../guildSettings";
import { registersAs } from "../utils/roleDetection";

// ── Re-exports of pure helpers (canonical home is src/utils/*) ────────────────
export { shuffle, pick } from "../utils/random";
export {
  getPlayerState,
  getRole,
  isEvil,
  hasFalsifiedInfo,
} from "../utils/runtime";
export { registersAs } from "../utils/roleDetection";
export type { DetectionTarget } from "../utils/roleDetection";

// ── Impure game-level helpers (need i18n / Discord / guild settings) ──────────

export function ensureRuntime(state: GameState): RuntimeState {
  if (!state.runtime) {
    const draft = state.draft!;
    const playerStates: PlayerRuntimeState[] = state.players.map((p) => {
      const role = draft.assignments.get(p.userId)!;
      const effectiveRole =
        role.id === "drunk" && draft.drunkFakeRole ? draft.drunkFakeRole : role;
      const tags = new Set<PlayerTag>();
      if (draft.redHerring === p.userId) tags.add("red_herring");
      return {
        player: p,
        role,
        effectiveRole,
        alive: true,
        death: null,
        tags,
      };
    });
    state.runtime = {
      nightNumber: 0,
      playerStates,
      nightSession: null,
      daySession: null,
      nightKillIds: [],
      nightKillIntentId: null,
      pendingGameEnds: [],
      phaseCompletion: null,
    };
  }
  return state.runtime;
}

export function getAlivePlayers(state: GameState): Player[] {
  const runtime = ensureRuntime(state);
  return runtime.playerStates.filter((ps) => ps.alive).map((ps) => ps.player);
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

// ── Legacy registersAs* aliases ──────────────────────────────────────────────
// Prefer `registersAs(role, target)` directly for new code.

export function registersAsTownsfolkForDetection(role: Role): boolean {
  return registersAs(role, "Townsfolk");
}
export function registersAsOutsiderForDetection(role: Role): boolean {
  return registersAs(role, "Outsider");
}
export function registersAsMinionForDetection(role: Role): boolean {
  return registersAs(role, "Minion");
}
export function registersAsEvilForDetection(role: Role): boolean {
  return registersAs(role, "Evil");
}
export function registersAsDemonForDetection(role: Role): boolean {
  return registersAs(role, "Demon");
}

// ── Player resolution by name ─────────────────────────────────────────────────

/**
 * Resolve a player by name. Tries case-insensitive exact match first
 * (displayName or username), then prefix match. Returns undefined if zero or
 * multiple players match.
 *
 * The `filter` option narrows the candidate pool — e.g. pass
 * `(p) => p.isTestPlayer === true` to resolve only fake players.
 */
export function resolvePlayer(
  name: string,
  players: Player[],
  filter?: (p: Player) => boolean,
): Player | undefined {
  const lower = name.toLowerCase().trim();
  const pool = filter ? players.filter(filter) : players;
  const exact = pool.filter(
    (p) =>
      p.displayName.toLowerCase() === lower ||
      p.username.toLowerCase() === lower,
  );
  if (exact.length === 1) return exact[0];
  const prefix = pool.filter(
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
