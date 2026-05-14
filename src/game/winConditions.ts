/**
 * Win-condition evaluation and game-end finalization.
 *
 * In automated mode a triggered condition finalizes the game in-place.
 *
 * In manual mode the proposal is appended to `runtime.pendingGameEnds`
 * and flow keeps running — players must not be able to tell from the bot's
 * response latency whether a death was decisive.
 */

import { Client, TextChannel } from "discord.js";
import { GameState } from "./types";
import { getRoleName, t } from "../i18n";
import { updateGame } from "./state";
import {
  channelLang,
  ensureRuntime,
  notifyStoryteller,
  playerDisplayName,
} from "./utils";

export type WinTeam = "good" | "evil";

export type WinConditionKind =
  | "good_imp_dead"
  | "good_mayor_three_alive"
  | "evil_two_alive"
  | "evil_saint_executed";

export interface WinCondition {
  kind: WinConditionKind;
  team: WinTeam;
  context?: { saintPlayerId?: string; mayorPlayerId?: string };
}

export interface GameEndProposal {
  id: string;
  condition: WinCondition;
  /** Announced before the win message (Saint / Mayor flavor); null when not applicable. */
  preamble: string | null;
  winAnnouncement: string;
  rolesReveal: string;
  enqueuedAt: number;
}

export type WinCheckTrigger = "death" | "day_end_no_execution";

/**
 * Priority order is load-bearing:
 *   1. Saint executed — wins even if other conditions also hold.
 *   2. Imp dead — Scarlet promotion already ran, so this checks post-handler state.
 *   3. Two or fewer alive.
 *   4. Mayor three-alive — only checked on day_end_no_execution trigger.
 */
export function evaluateWinCondition(
  state: GameState,
  opts: { trigger: WinCheckTrigger },
): WinCondition | null {
  const runtime = state.runtime;
  if (!runtime) return null;

  const saintExecuted = runtime.playerStates.find(
    (ps) =>
      ps.role.id === "saint" &&
      !ps.alive &&
      ps.death?.byExecution === true,
  );
  if (saintExecuted) {
    return {
      kind: "evil_saint_executed",
      team: "evil",
      context: { saintPlayerId: saintExecuted.player.userId },
    };
  }

  const impAlive = runtime.playerStates.some(
    (ps) => ps.role.id === "imp" && ps.alive,
  );
  if (!impAlive) {
    return { kind: "good_imp_dead", team: "good" };
  }

  const aliveCount = runtime.playerStates.filter((ps) => ps.alive).length;
  if (aliveCount <= 2) {
    return { kind: "evil_two_alive", team: "evil" };
  }

  if (opts.trigger === "day_end_no_execution" && aliveCount === 3) {
    const mayor = runtime.playerStates.find(
      (ps) => ps.alive && ps.role.id === "mayor",
    );
    if (mayor) {
      return {
        kind: "good_mayor_three_alive",
        team: "good",
        context: { mayorPlayerId: mayor.player.userId },
      };
    }
  }

  return null;
}

export function buildGameEndProposal(
  state: GameState,
  condition: WinCondition,
): GameEndProposal {
  const runtime = ensureRuntime(state);
  const lang = channelLang(state);

  let preamble: string | null = null;
  let winAnnouncement: string;

  switch (condition.kind) {
    case "evil_saint_executed": {
      const name = playerDisplayName(
        state,
        condition.context!.saintPlayerId!,
      );
      preamble = t(lang, "daySaintExecuted", { player: name });
      winAnnouncement = t(lang, "dayEvilWinsSaint");
      break;
    }
    case "good_imp_dead":
      winAnnouncement = t(lang, "dayGoodWins");
      break;
    case "evil_two_alive":
      winAnnouncement = t(lang, "dayEvilWinsAlive");
      break;
    case "good_mayor_three_alive": {
      const name = playerDisplayName(
        state,
        condition.context!.mayorPlayerId!,
      );
      preamble = t(lang, "dayMayorWin", { player: name });
      winAnnouncement = t(lang, "dayGoodWins");
      break;
    }
  }

  const lines = runtime.playerStates.map((ps) => {
    const aliveLabel = ps.alive ? t(lang, "dayAlive") : t(lang, "dayDead");
    const roleName = getRoleName(lang, ps.role.id);
    return `${ps.player.displayName} — ${roleName} (${aliveLabel})`;
  });
  const rolesReveal = t(lang, "dayFinalRoles", { roles: lines.join("\n") });

  return {
    id: nextProposalId(),
    condition,
    preamble,
    winAnnouncement,
    rolesReveal,
    enqueuedAt: Date.now(),
  };
}

let proposalCounter = 0;
function nextProposalId(): string {
  proposalCounter += 1;
  return `gep_${Date.now().toString(36)}_${proposalCounter}`;
}

/** Idempotent: a second call after phase=ended is a no-op. */
export async function finalizeGameEnd(
  client: Client,
  state: GameState,
  channel: TextChannel,
  messages: {
    preamble?: string | null;
    winAnnouncement: string;
    rolesReveal: string;
  },
): Promise<void> {
  if (state.phase === "ended") return;
  const runtime = ensureRuntime(state);
  state.phase = "ended";
  if (runtime.daySession) runtime.daySession.status = "ended";
  runtime.pendingGameEnds = [];
  updateGame(state);

  if (messages.preamble) {
    await channel.send(messages.preamble);
  }
  await channel.send(messages.winAnnouncement);
  await channel.send(messages.rolesReveal);
}

/**
 * Returns true iff the game synchronously ended (automated mode + win condition).
 * In manual mode always returns false — the proposal is queued and flow
 * continues. Deduplicated by `WinConditionKind` so persistent state (e.g. a
 * dead Saint) doesn't re-enqueue on every subsequent event.
 */
export async function maybeEndGame(
  client: Client,
  state: GameState,
  channel: TextChannel,
  trigger: WinCheckTrigger,
): Promise<boolean> {
  const runtime = ensureRuntime(state);

  const condition = evaluateWinCondition(state, { trigger });
  if (!condition) return false;

  if (state.mode === "manual" && state.storytellerId) {
    const alreadyPending = runtime.pendingGameEnds.some(
      (p) => p.condition.kind === condition.kind,
    );
    if (alreadyPending) return false;

    const proposal = buildGameEndProposal(state, condition);
    runtime.pendingGameEnds.push(proposal);
    updateGame(state);

    notifyStoryteller(
      client,
      state,
      t(channelLang(state), "gameEndPendingApproval", {
        message: proposal.winAnnouncement,
      }),
    );
    return false;
  }

  const proposal = buildGameEndProposal(state, condition);
  await finalizeGameEnd(client, state, channel, {
    preamble: proposal.preamble,
    winAnnouncement: proposal.winAnnouncement,
    rolesReveal: proposal.rolesReveal,
  });
  return true;
}

/** Omitted edit fields fall back to the snapshot taken when the proposal was queued. */
export async function approvePendingGameEnd(
  client: Client,
  state: GameState,
  channel: TextChannel,
  edits?: {
    preamble?: string | null;
    winAnnouncement?: string;
    rolesReveal?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const runtime = ensureRuntime(state);
  const head = runtime.pendingGameEnds[0];
  if (!head) return { ok: false, error: "No pending game-end" };

  await finalizeGameEnd(client, state, channel, {
    preamble: edits?.preamble ?? head.preamble,
    winAnnouncement: edits?.winAnnouncement ?? head.winAnnouncement,
    rolesReveal: edits?.rolesReveal ?? head.rolesReveal,
  });
  return { ok: true };
}

/**
 * Drop the proposal at the head of the queue. Game state is unchanged — flow
 * was already continuing.
 */
export function dismissPendingGameEnd(
  state: GameState,
): { ok: boolean; error?: string } {
  const runtime = ensureRuntime(state);
  if (runtime.pendingGameEnds.length === 0) {
    return { ok: false, error: "No pending game-end" };
  }
  runtime.pendingGameEnds.shift();
  updateGame(state);
  return { ok: true };
}
