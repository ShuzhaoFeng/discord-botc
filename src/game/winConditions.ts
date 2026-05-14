/**
 * Win-condition evaluation and game-end finalization.
 *
 * Generic conditions (demon dead, two-or-fewer alive) live here. Role-specific
 * conditions are `winConditionHandler`s on individual `RoleDefinition`s.
 *
 * In automated mode a triggered condition finalizes the game in-place. In
 * manual mode the proposal is queued in `runtime.pendingGameEnds` and flow
 * keeps running — players must not be able to tell from bot latency whether
 * a death was decisive.
 */

import { Client, TextChannel } from "discord.js";
import {
  ActiveGameState,
  GameEndProposal,
  GameState,
  Lang,
  WinCheckTrigger,
  WinVerdict,
} from "./types";
import { getRoleName, t } from "../i18n";
import { updateGame } from "./state";
import {
  channelLang,
  ensureRuntime,
  notifyStoryteller,
} from "./utils";
import { ALL_ROLE_DEFINITIONS } from "../roles/index";

export type { WinCheckTrigger, WinVerdict, GameEndProposal } from "./types";

function evaluateGeneric(
  state: ActiveGameState,
  lang: Lang,
): WinVerdict | null {
  const runtime = state.runtime;

  const impAlive = runtime.playerStates.some(
    (ps) => ps.role.id === "imp" && ps.alive,
  );
  if (!impAlive) {
    return {
      kind: "good_imp_dead",
      team: "good",
      preamble: null,
      winAnnouncement: t(lang, "dayGoodWins"),
    };
  }

  const aliveCount = runtime.playerStates.filter((ps) => ps.alive).length;
  if (aliveCount <= 2) {
    return {
      kind: "evil_two_alive",
      team: "evil",
      preamble: null,
      winAnnouncement: t(lang, "dayEvilWinsAlive"),
    };
  }

  return null;
}

export function evaluateWinCondition(
  state: GameState,
  opts: { trigger: WinCheckTrigger },
): WinVerdict | null {
  if (!state.runtime) return null;
  const activeState = state as ActiveGameState;
  const lang = channelLang(state);

  for (const def of ALL_ROLE_DEFINITIONS) {
    const handler = def.winConditionHandler;
    if (!handler) continue;
    const verdict = handler.evaluate({
      state: activeState,
      trigger: opts.trigger,
      lang,
    });
    if (verdict) return verdict;
  }

  return evaluateGeneric(activeState, lang);
}

export function buildGameEndProposal(
  state: GameState,
  verdict: WinVerdict,
): GameEndProposal {
  const runtime = ensureRuntime(state);
  const lang = channelLang(state);

  const lines = runtime.playerStates.map((ps) => {
    const aliveLabel = ps.alive ? t(lang, "dayAlive") : t(lang, "dayDead");
    const roleName = getRoleName(lang, ps.role.id);
    return `${ps.player.displayName} — ${roleName} (${aliveLabel})`;
  });
  const rolesReveal = t(lang, "dayFinalRoles", { roles: lines.join("\n") });

  return {
    id: nextProposalId(),
    kind: verdict.kind,
    team: verdict.team,
    preamble: verdict.preamble,
    winAnnouncement: verdict.winAnnouncement,
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
 * continues. Deduplicated by `WinVerdict.kind` so persistent state (e.g. a
 * dead Saint) doesn't re-enqueue on every subsequent event.
 */
export async function maybeEndGame(
  client: Client,
  state: GameState,
  channel: TextChannel,
  trigger: WinCheckTrigger,
): Promise<boolean> {
  const runtime = ensureRuntime(state);

  const verdict = evaluateWinCondition(state, { trigger });
  if (!verdict) return false;

  if (state.mode === "manual" && state.storytellerId) {
    const alreadyPending = runtime.pendingGameEnds.some(
      (p) => p.kind === verdict.kind,
    );
    if (alreadyPending) return false;

    const proposal = buildGameEndProposal(state, verdict);
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

  const proposal = buildGameEndProposal(state, verdict);
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
