import {
  Client,
  ChatInputCommandInteraction,
  TextChannel,
} from "discord.js";
import { ActiveGameState, GameState, NominationRecord, Player } from "./types";
import { getLang, getRoleName, t } from "../i18n";
import { getGame, updateGame } from "./state";
import { ensureRuntime, getPlayerState, getRole } from "./night";
import { resolvePlayer, channelLang } from "./utils";
import { triggerDeathHandlers } from "./death";

// ── Local helpers ─────────────────────────────────────────────────────────────

export function getAlivePlayers(state: GameState): Player[] {
  const runtime = ensureRuntime(state);
  return runtime.playerStates.filter((ps) => ps.alive).map((ps) => ps.player);
}

export function playerDisplayName(state: GameState, userId: string): string {
  return state.players.find((p) => p.userId === userId)?.displayName ?? userId;
}

// ── Nomination timer storage ──────────────────────────────────────────────────

const nominationTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelNominationTimer(channelId: string): void {
  const timer = nominationTimers.get(channelId);
  if (timer !== undefined) {
    clearTimeout(timer);
    nominationTimers.delete(channelId);
  }
}

// ── Win condition check ───────────────────────────────────────────────────────

/** Check win conditions and end game if triggered. Returns true if game ended. */
async function checkWinConditions(
  client: Client,
  state: GameState,
  channel: TextChannel,
): Promise<boolean> {
  const runtime = ensureRuntime(state);

  // Find the current Imp (may have shifted to Scarlet Woman)
  const impPs = runtime.playerStates.find((ps) => ps.role.id === "imp");
  const impAlive = impPs?.alive ?? false;

  const aliveCount = getAlivePlayers(state).length;

  // Evil wins: 2 or fewer players alive
  if (aliveCount <= 2) {
    await endGame(client, state, channel, "evil");
    return true;
  }

  // Good wins: Imp is dead (Scarlet Woman already handled in killPlayer)
  if (!impAlive) {
    await endGame(client, state, channel, "good");
    return true;
  }

  return false;
}

export async function endGame(
  client: Client,
  state: GameState,
  channel: TextChannel,
  winner: "good" | "evil" | "good_saint_fail",
): Promise<void> {
  const runtime = ensureRuntime(state);
  const lang = channelLang(state);

  state.phase = "ended";
  if (runtime.daySession) runtime.daySession.status = "ended";
  cancelNominationTimer(state.channelId);
  updateGame(state);

  if (winner === "good") {
    await channel.send(t(lang, "dayGoodWins"));
  } else if (winner === "evil") {
    await channel.send(t(lang, "dayEvilWinsAlive"));
  } else {
    await channel.send(t(lang, "dayEvilWinsSaint"));
  }

  // Role reveal
  const lines = runtime.playerStates.map((ps) => {
    const aliveLabel = ps.alive ? t(lang, "dayAlive") : t(lang, "dayDead");
    const roleName = getRoleName(lang, ps.role.id);
    return `${ps.player.displayName} — ${roleName} (${aliveLabel})`;
  });
  await channel.send(t(lang, "dayFinalRoles", { roles: lines.join("\n") }));
}

/**
 * Kill a player during the day phase. Triggers all registered death handlers
 * (Scarlet Woman, Saint, etc.) then checks win conditions.
 * Returns true if the game ended.
 */
export async function killPlayerDuringDay(
  client: Client,
  state: GameState,
  channel: TextChannel,
  playerId: string,
  byExecution = false,
): Promise<boolean> {
  const runtime = ensureRuntime(state);
  const playerState = getPlayerState(runtime, playerId);
  if (!playerState || !playerState.alive) return false;

  playerState.alive = false;
  updateGame(state);

  const lang = channelLang(state);
  const name = playerDisplayName(state, playerId);
  await channel.send(t(lang, "dayPlayerDied", { name }));

  await triggerDeathHandlers(
    client,
    state as ActiveGameState,
    playerId,
    "day",
    byExecution,
  );

  const pending = runtime.pendingEndGame;
  if (pending) {
    runtime.pendingEndGame = null;
    if (pending.winner === "good_saint_fail") {
      await channel.send(t(lang, "daySaintExecuted", { player: name }));
    }
    await endGame(client, state, channel, pending.winner);
    return true;
  }

  return await checkWinConditions(client, state, channel);
}

// ── Nomination window close ───────────────────────────────────────────────────

async function closeNominationWindow(
  client: Client,
  channelId: string,
): Promise<void> {
  nominationTimers.delete(channelId);

  const state = getGame(channelId);
  if (!state || state.phase !== "in_progress") return;

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;
  if (!daySession || !daySession.activeNomination) return;

  const nomination = daySession.activeNomination;
  if (nomination.status !== "active") return;

  const channel = (await client.channels.fetch(channelId)) as TextChannel;
  await finalizeNomination(client, state, nomination, channel);
}

async function finalizeNomination(
  client: Client,
  state: GameState,
  nomination: NominationRecord,
  channel: TextChannel,
): Promise<void> {
  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession!;
  const lang = channelLang(state);

  // Count votes, applying Butler rule
  const alivePlayers = getAlivePlayers(state);
  const aliveThenCount = alivePlayers.length;

  let voteCount = 0;
  for (const voterId of nomination.votes) {
    const voterPs = getPlayerState(runtime, voterId);
    if (voterPs?.role.id === "butler") {
      // Butler vote only counts if master also voted by window close
      const masterId = runtime.playerStates.find((ps) =>
        ps.tags.has("butler_master"),
      )?.player.userId;
      if (masterId && nomination.votes.has(masterId)) {
        voteCount++;
      }
    } else {
      voteCount++;
    }
  }

  nomination.finalVoteCount = voteCount;
  nomination.aliveThenCount = aliveThenCount;
  nomination.windowClosedAt = Date.now();
  nomination.status = "completed";
  daySession.activeNomination = null;

  const required = Math.floor(aliveThenCount / 2) + 1;
  const nomineeName = playerDisplayName(state, nomination.nomineeId);
  await channel.send(
    t(lang, "dayVoteClosed", {
      nominee: nomineeName,
      count: voteCount,
      required,
    }),
  );

  updateGame(state);

  // Check if all alive players have now been nominated (day ends automatically)
  const allNominated = checkAllNominated(state);
  if (allNominated && !daySession.dayEndsAfterNomination) {
    daySession.dayEndsAfterNomination = true;
    await channel.send(t(lang, "dayAllNominated"));
  }

  // If any end condition is met and no active nomination, process end of day
  if (daySession.dayEndsAfterNomination && !daySession.activeNomination) {
    await processEndOfDay(client, state, channel);
  }
}

function checkAllNominated(state: GameState): boolean {
  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession!;
  const alivePlayers = getAlivePlayers(state);
  return alivePlayers.every((p) => daySession.nomineeIds.has(p.userId));
}

// ── End-of-day processing ─────────────────────────────────────────────────────

async function processEndOfDay(
  client: Client,
  state: GameState,
  channel: TextChannel,
): Promise<void> {
  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession!;
  const lang = channelLang(state);

  daySession.status = "ended";
  updateGame(state);

  // Tally all completed nominations to find who gets executed
  const completed = daySession.nominations.filter(
    (n) => n.status === "completed",
  );

  let executedNomination: NominationRecord | null = null;
  let maxVotes = 0;
  let tie = false;

  for (const nom of completed) {
    const required = Math.floor(nom.aliveThenCount / 2) + 1;
    if (nom.finalVoteCount < required) continue; // Doesn't meet majority threshold

    if (nom.finalVoteCount > maxVotes) {
      maxVotes = nom.finalVoteCount;
      executedNomination = nom;
      tie = false;
    } else if (nom.finalVoteCount === maxVotes) {
      tie = true;
      executedNomination = null;
    }
  }

  if (tie || !executedNomination) {
    await channel.send(t(lang, "dayNoExecution"));

    // Mayor win condition: exactly 3 alive, no execution, Mayor is alive
    const alive = getAlivePlayers(state);
    if (alive.length === 3) {
      const mayorPlayer = alive.find(
        (p) => getRole(runtime,p.userId).id === "mayor",
      );
      if (mayorPlayer) {
        await channel.send(
          t(lang, "dayMayorWin", { player: mayorPlayer.displayName }),
        );
        await endGame(client, state, channel, "good");
        return;
      }
    }

    runtime.lastExecutedPlayerId = null;
    updateGame(state);
    await startNextNight(client, state, channel);
    return;
  }

  // Execute the winner
  const executeId = executedNomination.nomineeId;
  const executeName = playerDisplayName(state, executeId);

  await channel.send(
    t(lang, "dayExecuted", {
      player: executeName,
      votes: executedNomination.finalVoteCount,
    }),
  );

  runtime.lastExecutedPlayerId = executeId;
  updateGame(state);

  const gameEnded = await killPlayerDuringDay(
    client,
    state,
    channel,
    executeId,
    true, // byExecution — triggers Saint death handler if applicable
  );
  if (gameEnded) return;

  await startNextNight(client, state, channel);
}

async function startNextNight(
  client: Client,
  state: GameState,
  channel: TextChannel,
): Promise<void> {
  const lang = channelLang(state);
  await channel.send(t(lang, "dayNightFalls"));
  // Dynamic import to avoid circular dependency with night.ts
  const { startNightPhase } = (await import("./night")) as {
    startNightPhase: (client: Client, state: GameState) => Promise<void>;
  };
  await startNightPhase(client, state);
}

// ── startDayPhase (called from night.ts after step 3 messages are sent) ───────

export async function startDayPhase(
  client: Client,
  state: GameState,
): Promise<void> {
  const runtime = ensureRuntime(state);
  const lang = channelLang(state);

  // Consume night kill list
  const nightKillIds = [...(runtime.nightKillIds ?? [])];
  runtime.nightKillIds = [];

  const dayNumber = runtime.nightNumber; // day N follows night N

  // Initialize day session
  runtime.daySession = {
    dayNumber,
    nominatorIds: new Set(),
    nomineeIds: new Set(),
    nominations: [],
    activeNomination: null,
    endDayVotes: new Set(),
    endDayThresholdMet: false,
    dayEndsAfterNomination: false,
    status: "open",
    nightKillIds: [],
    pendingSlayRecluse: null,
    pendingSlayFixed: null,
  };

  updateGame(state);

  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;

  // Announce night deaths
  if (nightKillIds.length === 0) {
    await channel.send(t(lang, "dayDawnPeaceful", { day: dayNumber }));
  } else {
    const deathNames = nightKillIds
      .map((id) => playerDisplayName(state, id))
      .join(", ");
    await channel.send(
      t(lang, "dayDawnDeaths", { day: dayNumber, players: deathNames }),
    );
  }

  // Check win conditions right after night deaths
  const gameEnded = await checkWinConditions(client, state, channel);
  if (gameEnded) return;

  // Announce alive players and open discussion
  const alive = getAlivePlayers(state);
  const sep = lang === "zh" ? "、" : ", ";
  const aliveNames = alive.map((p) => p.displayName).join(sep);
  await channel.send(
    t(lang, "dayDiscussionOpen", { count: alive.length, players: aliveNames }),
  );
}

// ── /nominate command handler ─────────────────────────────────────────────────

export async function handleNominate(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const lang = getLang(i.user.id);
  const state = getGame(i.channelId);

  if (!state || state.phase !== "in_progress") {
    await i.reply({ content: t(lang, "dayNoActiveGame"), ephemeral: true });
    return;
  }

  // Storyteller cannot nominate
  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: t(lang, "dayStorytellerCannotNominate"),
      ephemeral: true,
    });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({
      content: t(lang, "dayNominationsNotOpen"),
      ephemeral: true,
    });
    return;
  }

  // Must be a registered player
  const nominator = state.players.find((p) => p.userId === i.user.id);
  if (!nominator) {
    await i.reply({ content: t(lang, "dayNotAPlayer"), ephemeral: true });
    return;
  }

  // Must be alive
  const nominatorRtState = getPlayerState(runtime, i.user.id);
  if (!nominatorRtState?.alive) {
    await i.reply({
      content: t(lang, "dayDeadCannotNominate"),
      ephemeral: true,
    });
    return;
  }

  // Each player may nominate at most once per day
  if (daySession.nominatorIds.has(i.user.id)) {
    await i.reply({ content: t(lang, "dayAlreadyNominated"), ephemeral: true });
    return;
  }

  // No new nominations after end condition triggered
  if (daySession.endDayThresholdMet || daySession.dayEndsAfterNomination) {
    await i.reply({ content: t(lang, "dayNoNewNominations"), ephemeral: true });
    return;
  }

  // Cannot start if another nomination is active
  if (daySession.activeNomination) {
    await i.reply({
      content: t(lang, "dayNominationInProgress"),
      ephemeral: true,
    });
    return;
  }

  // Resolve nominee
  const nomineeInput = i.options.getString("player", true);
  const nominee = resolvePlayer(nomineeInput, state.players);
  if (!nominee) {
    await i.reply({
      content: t(lang, "dayUnknownPlayer", { player: nomineeInput }),
      ephemeral: true,
    });
    return;
  }

  // Nominee must be alive
  const nomineeRtState = getPlayerState(runtime, nominee.userId);
  if (!nomineeRtState?.alive) {
    await i.reply({
      content: t(lang, "dayNomineeDead", { player: nominee.displayName }),
      ephemeral: true,
    });
    return;
  }

  // Each player may be nominated at most once per day
  if (daySession.nomineeIds.has(nominee.userId)) {
    await i.reply({
      content: t(lang, "dayAlreadyNominee", { player: nominee.displayName }),
      ephemeral: true,
    });
    return;
  }

  // ── Virgin check ──────────────────────────────────────────────────────────
  const nomineeRole = getRole(runtime,nominee.userId);
  const nominatorRealRole = getRole(runtime,i.user.id);

  // Virgin triggers if: nominee is Virgin, not poisoned, never nominated before,
  // and nominator's true role is Townsfolk (not Drunk, not Evil)
  const virginTriggered =
    nomineeRole.id === "virgin" &&
    !(getPlayerState(runtime, nominee.userId)?.tags.has("poisoned") ?? false) &&
    nominatorRealRole.id !== "drunk" &&
    nominatorRealRole.category === "Townsfolk";

  // Mark as nominated/nominator (before any early returns)
  daySession.nominatorIds.add(i.user.id);
  daySession.nomineeIds.add(nominee.userId);

  if (virginTriggered) {
    await i.reply(
      t(lang, "dayNominateVirgin", {
        nominator: nominator.displayName,
        nominee: nominee.displayName,
      }),
    );

    // Cancel nomination with 0 votes
    const nomination: NominationRecord = {
      nominatorId: i.user.id,
      nomineeId: nominee.userId,
      votes: new Set(),
      finalVoteCount: 0,
      aliveThenCount: getAlivePlayers(state).length,
      windowClosedAt: Date.now(),
      status: "cancelled",
    };
    daySession.nominations.push(nomination);
    runtime.lastExecutedPlayerId = i.user.id;
    updateGame(state);

    const channel = (await client.channels.fetch(
      state.channelId,
    )) as TextChannel;
    await channel.send(
      t(lang, "dayVirginTriggered", { nominator: nominator.displayName }),
    );

    const gameEnded = await killPlayerDuringDay(
      client,
      state,
      channel,
      i.user.id,
      true, // byExecution — triggers Saint death handler if applicable
    );
    if (!gameEnded) {
      if (checkAllNominated(state) || daySession.endDayThresholdMet) {
        daySession.dayEndsAfterNomination = true;
        await processEndOfDay(client, state, channel);
      }
    }
    return;
  }

  // ── Normal nomination ─────────────────────────────────────────────────────
  const nomination: NominationRecord = {
    nominatorId: i.user.id,
    nomineeId: nominee.userId,
    votes: new Set([i.user.id]), // nominator's vote is automatic
    finalVoteCount: 0,
    aliveThenCount: 0,
    windowClosedAt: 0,
    status: "active",
  };
  daySession.nominations.push(nomination);
  daySession.activeNomination = nomination;
  updateGame(state);

  await i.reply(
    t(lang, "dayNominate", {
      nominator: nominator.displayName,
      nominee: nominee.displayName,
    }),
  );

  // 1-minute vote window
  const timer = setTimeout(() => {
    closeNominationWindow(client, state.channelId).catch(console.error);
  }, 60_000);
  nominationTimers.set(state.channelId, timer);
}

// ── /ye command handler ───────────────────────────────────────────────────────

export async function handleYe(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const lang = getLang(i.user.id);
  const state = getGame(i.channelId);

  if (!state || state.phase !== "in_progress") {
    await i.reply({ content: t(lang, "dayNoActiveGame"), ephemeral: true });
    return;
  }

  // Storyteller cannot vote
  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: t(lang, "dayStorytellerCannotVote"),
      ephemeral: true,
    });
    return;
  }

  const player = state.players.find((p) => p.userId === i.user.id);
  if (!player) {
    await i.reply({ content: t(lang, "dayNotInGame"), ephemeral: true });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({ content: t(lang, "dayVotingNotOpen"), ephemeral: true });
    return;
  }

  const nomination = daySession.activeNomination;
  if (!nomination || nomination.status !== "active") {
    await i.reply({
      content: t(lang, "dayNoActiveNomination"),
      ephemeral: true,
    });
    return;
  }

  const playerState = getPlayerState(runtime, i.user.id);
  const isAlive = playerState?.alive ?? false;

  if (!isAlive) {
    // Dead player uses ghost vote
    if (playerState?.tags.has("ghost_vote_used")) {
      await i.reply({ content: t(lang, "dayGhostVoteUsed"), ephemeral: true });
      return;
    }
    // Mark ghost vote as used
    if (playerState) playerState.tags.add("ghost_vote_used");
  }

  if (nomination.votes.has(i.user.id)) {
    await i.reply({ content: t(lang, "dayAlreadyVoted"), ephemeral: true });
    return;
  }

  nomination.votes.add(i.user.id);
  updateGame(state);

  const nomineeName = playerDisplayName(state, nomination.nomineeId);
  const ghostNote = !isAlive ? t(lang, "dayGhostVoteExhausted") : "";
  await i.reply({
    content: t(lang, "dayVoteRecorded", { nominee: nomineeName, ghostNote }),
    ephemeral: true,
  });
}

export async function cancelActiveNomination(
  client: Client,
  state: GameState,
  channel: TextChannel,
  killedPlayerId: string,
): Promise<void> {
  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession!;
  const nomination = daySession.activeNomination;
  if (!nomination || nomination.status !== "active") return;

  const lang = channelLang(state);
  const killedName = playerDisplayName(state, killedPlayerId);

  cancelNominationTimer(state.channelId);
  nomination.status = "cancelled";
  daySession.activeNomination = null;

  await channel.send(t(lang, "dayCancelNomination", { player: killedName }));
  updateGame(state);

  // Check if day should still end
  if (daySession.dayEndsAfterNomination) {
    await processEndOfDay(client, state, channel);
  }
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

// ── /endday command handler ───────────────────────────────────────────────────

export async function handleEndDay(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const lang = getLang(i.user.id);
  const state = getGame(i.channelId);

  if (!state || state.phase !== "in_progress") {
    await i.reply({ content: t(lang, "dayNoActiveGame"), ephemeral: true });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({ content: t(lang, "dayNotDaytime"), ephemeral: true });
    return;
  }

  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;

  // Storyteller /endday ends the day immediately
  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: t(lang, "dayEndedByStoryteller"),
      ephemeral: true,
    });
    daySession.dayEndsAfterNomination = true;
    updateGame(state);

    if (!daySession.activeNomination) {
      await processEndOfDay(client, state, channel);
    } else {
      await channel.send(t(lang, "dayStorytellerCalledEnd"));
    }
    return;
  }

  // Players vote to end the day
  const player = state.players.find((p) => p.userId === i.user.id);
  if (!player) {
    await i.reply({ content: t(lang, "dayNotInGame"), ephemeral: true });
    return;
  }

  // Dead players' /endday is silently ignored
  const playerState = getPlayerState(runtime, i.user.id);
  if (!playerState?.alive) {
    await i.reply({ content: t(lang, "dayNoted"), ephemeral: true });
    return;
  }

  // Already voted
  if (daySession.endDayVotes.has(i.user.id)) {
    await i.reply({
      content: t(lang, "dayAlreadyVotedEndDay"),
      ephemeral: true,
    });
    return;
  }

  daySession.endDayVotes.add(i.user.id);
  updateGame(state);

  // Check threshold: strictly more than half of alive players
  const aliveCount = getAlivePlayers(state).length;
  const threshold = Math.floor(aliveCount / 2) + 1;
  const voteCount = daySession.endDayVotes.size;

  await i.reply({
    content: t(lang, "dayEndDayVoteRecorded", { count: voteCount, threshold }),
    ephemeral: true,
  });

  if (voteCount >= threshold && !daySession.endDayThresholdMet) {
    daySession.endDayThresholdMet = true;
    daySession.dayEndsAfterNomination = true;
    updateGame(state);

    const suffix = daySession.activeNomination
      ? t(lang, "dayEndDayThresholdSuffix")
      : "";
    await channel.send(
      t(lang, "dayEndDayThreshold", { count: voteCount, total: aliveCount }) +
        suffix,
    );

    if (!daySession.activeNomination) {
      await processEndOfDay(client, state, channel);
    }
  }
}

/** Handle the case where a /ye voter is killed during the vote window. */
export function removeVoteIfKilledDuringNomination(
  state: GameState,
  playerId: string,
): void {
  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;
  if (!daySession?.activeNomination) return;
  if (daySession.activeNomination.votes.has(playerId)) {
    daySession.activeNomination.votes.delete(playerId);
  }
}

export interface ActiveNominationInfo {
  nomineeName: string;
  nominatorName: string;
  voterNames: string[];
  voteCount: number;
}

export function getActiveNominationInfo(
  state: GameState,
): ActiveNominationInfo | null {
  const runtime = ensureRuntime(state);
  const nomination = runtime.daySession?.activeNomination;
  if (!nomination || nomination.status !== "active") return null;
  return {
    nomineeName: playerDisplayName(state, nomination.nomineeId),
    nominatorName: playerDisplayName(state, nomination.nominatorId),
    voterNames: [...nomination.votes].map((id) => playerDisplayName(state, id)),
    voteCount: nomination.votes.size,
  };
}
