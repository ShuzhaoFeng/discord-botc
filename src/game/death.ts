/**
 * The three exported mutators (`killPlayer`, `revivePlayer`, `useGhostVote`)
 * are the only places that may touch `PlayerRuntimeState.alive` or `.death`.
 * They enforce the invariant `alive === (death === null)`, which is what
 * lets every death-derived consequence (Undertaker target, Saint loss,
 * ghost-vote-used) be derived from `ps.death` rather than tracked in a
 * parallel slot — a revive cleanly unwinds the death in one step.
 */

import { Client, TextChannel } from "discord.js";
import { ActiveGameState, DeathRecord, GameState } from "./types";
import { ALL_ROLE_DEFINITIONS } from "../roles/index";
import type { DeathCtx } from "../roles/types";
import { t } from "../i18n";
import { updateGame } from "./state";
import {
  channelLang,
  ensureRuntime,
  getPlayerState,
  playerDisplayName,
} from "./utils";
import { maybeEndGame } from "./winConditions";

export interface KillOptions {
  phase: "day" | "night";
  byExecution: boolean;
  channel?: TextChannel;
  /** Defaults to true for day deaths, false for night. */
  announce?: boolean;
  /** Defer the win check to a later batched call. */
  skipWinCheck?: boolean;
}

/** Stops early if the game already ended mid-loop. */
export async function triggerDeathHandlers(
  client: Client,
  state: ActiveGameState,
  deadPlayerId: string,
  phase: "day" | "night",
  byExecution: boolean,
): Promise<void> {
  const ctx: DeathCtx = { state, client, deadPlayerId, phase, byExecution };
  for (const def of ALL_ROLE_DEFINITIONS) {
    if (!def.deathHandler) continue;
    await def.deathHandler.onDeath(ctx);
    if (state.phase === "ended") break;
  }
}

/**
 * Returns true iff the game synchronously ended (automated mode + win
 * condition). Manual mode returns false even when a proposal is enqueued.
 */
export async function killPlayer(
  client: Client,
  state: GameState,
  playerId: string,
  opts: KillOptions,
): Promise<boolean> {
  const runtime = ensureRuntime(state);
  const ps = getPlayerState(runtime, playerId);
  if (!ps || !ps.alive) return false;

  const record: DeathRecord = {
    byExecution: opts.byExecution,
    phase: opts.phase,
    dayNumber: runtime.daySession?.dayNumber ?? 0,
    nightNumber: runtime.nightNumber,
    timestamp: Date.now(),
    ghostVoteUsed: false,
  };
  ps.alive = false;
  ps.death = record;
  updateGame(state);

  const announce = opts.announce ?? opts.phase === "day";
  let channel = opts.channel;
  if (announce || !opts.skipWinCheck) {
    channel ??= (await client.channels.fetch(state.channelId)) as TextChannel;
  }

  if (announce && channel) {
    const lang = channelLang(state);
    const name = playerDisplayName(state, playerId);
    await channel.send(t(lang, "dayPlayerDied", { name }));
  }

  await triggerDeathHandlers(
    client,
    state as ActiveGameState,
    playerId,
    opts.phase,
    opts.byExecution,
  );

  if (opts.skipWinCheck) return false;
  return await maybeEndGame(client, state, channel!, "death");
}

/** Returns false (no-op) if the player was already alive. */
export function revivePlayer(state: GameState, playerId: string): boolean {
  const runtime = ensureRuntime(state);
  const ps = getPlayerState(runtime, playerId);
  if (!ps || ps.alive) return false;
  ps.alive = true;
  ps.death = null;
  updateGame(state);
  return true;
}

export function useGhostVote(
  state: GameState,
  playerId: string,
): { ok: boolean; error?: string } {
  const runtime = ensureRuntime(state);
  const ps = getPlayerState(runtime, playerId);
  if (!ps) return { ok: false, error: "Player not found" };
  if (ps.alive || !ps.death) {
    return { ok: false, error: "Player is alive" };
  }
  if (ps.death.ghostVoteUsed) {
    return { ok: false, error: "Ghost vote already used" };
  }
  ps.death.ghostVoteUsed = true;
  updateGame(state);
  return { ok: true };
}
