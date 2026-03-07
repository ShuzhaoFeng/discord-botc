import {
  Client,
  ChatInputCommandInteraction,
  TextChannel,
  Message,
} from "discord.js";
import { GameState, NominationRecord, Player, Lang } from "./types";
import { getLang, getRoleName, t } from "../i18n";
import { sendPlayerDm } from "../utils/sendPlayerDm";
import { getGame, updateGame } from "./state";
import { getScript } from "./roles";
import { ensureRuntime } from "./night";

// ── Local helpers ─────────────────────────────────────────────────────────────

function getAlivePlayers(state: GameState): Player[] {
  const runtime = ensureRuntime(state);
  return state.players.filter((p) => runtime.playerStates.get(p.userId)?.alive);
}

function getRole(state: GameState, playerId: string) {
  return state.draft!.assignments.get(playerId)!;
}

function isPoisoned(state: GameState, playerId: string): boolean {
  const runtime = ensureRuntime(state);
  return runtime.playerStates.get(playerId)?.poisoned ?? false;
}

function channelLang(state: GameState): Lang {
  return getLang(state.players[0]?.userId ?? "");
}

function playerDisplayName(state: GameState, userId: string): string {
  return state.players.find((p) => p.userId === userId)?.displayName ?? userId;
}

function resolvePlayer(input: string, state: GameState): Player | undefined {
  const lower = input.toLowerCase().trim();
  const exact = state.players.filter(
    (p) =>
      p.displayName.toLowerCase() === lower ||
      p.username.toLowerCase() === lower,
  );
  if (exact.length === 1) return exact[0];
  const prefix = state.players.filter(
    (p) =>
      p.displayName.toLowerCase().startsWith(lower) ||
      p.username.toLowerCase().startsWith(lower),
  );
  if (prefix.length === 1) return prefix[0];
  return undefined;
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
  const draft = state.draft!;

  // Find the current Imp (may have shifted to Scarlet Woman)
  const impPlayer = state.players.find(
    (p) => draft.assignments.get(p.userId)?.id === "imp",
  );
  const impAlive = impPlayer
    ? (runtime.playerStates.get(impPlayer.userId)?.alive ?? false)
    : false;

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

async function endGame(
  client: Client,
  state: GameState,
  channel: TextChannel,
  winner: "good" | "evil" | "good_saint_fail",
): Promise<void> {
  const runtime = ensureRuntime(state);
  const draft = state.draft!;
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
  const lines = state.players.map((p) => {
    const role = draft.assignments.get(p.userId)!;
    const ps = runtime.playerStates.get(p.userId)!;
    const aliveLabel = ps.alive ? t(lang, "dayAlive") : t(lang, "dayDead");
    const roleName = getRoleName(lang, role.id);
    return `${p.displayName} — ${roleName} (${aliveLabel})`;
  });
  await channel.send(t(lang, "dayFinalRoles", { roles: lines.join("\n") }));
}

/**
 * Kill a player during the day phase. Handles Scarlet Woman transform.
 * Returns true if the game ended.
 */
export async function killPlayerDuringDay(
  client: Client,
  state: GameState,
  channel: TextChannel,
  playerId: string,
): Promise<boolean> {
  const runtime = ensureRuntime(state);
  const playerState = runtime.playerStates.get(playerId);
  if (!playerState || !playerState.alive) return false;

  playerState.alive = false;
  updateGame(state);

  const lang = channelLang(state);
  const name = playerDisplayName(state, playerId);
  await channel.send(t(lang, "dayPlayerDied", { name }));

  // Scarlet Woman check: if the dead player is the Imp and SW is alive with 5+ alive
  const deadRole = getRole(state, playerId);
  if (deadRole.id === "imp") {
    const alive = getAlivePlayers(state);
    const swPlayer = alive.find(
      (p) => getRole(state, p.userId).id === "scarlet_woman",
    );
    if (swPlayer && alive.length >= 5) {
      // SW becomes the new Imp
      const impRole = getScript().roles.find((r) => r.id === "imp")!;
      state.draft!.assignments.set(swPlayer.userId, impRole);
      updateGame(state);

      // Notify SW via DM
      const swLang = getLang(swPlayer.userId);
      await sendPlayerDm(
        client,
        swPlayer,
        state,
        t(swLang, "dayScarletWomanBecomesImp"),
      );

      // If manual mode, also notify storyteller
      if (state.mode === "manual" && state.storytellerId) {
        try {
          const stUser = await client.users.fetch(state.storytellerId);
          const stLang = getLang(state.storytellerId);
          await stUser.send(
            t(stLang, "dayScarletWomanStorytellerNotify", {
              player: swPlayer.displayName,
            }),
          );
        } catch {
          // Ignore DM failure
        }
      }

      await channel.send(t(lang, "dayScarletWomanChannelNotify"));
      // Game does NOT end — Imp role transferred
      return await checkWinConditions(client, state, channel);
    }
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
    const voterRole = state.draft!.assignments.get(voterId);
    if (voterRole?.id === "butler") {
      // Butler vote only counts if master also voted by window close
      const masterId = runtime.playerStates.get(voterId)?.butlerMasterId;
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
        (p) => getRole(state, p.userId).id === "mayor",
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
  const executeRole = getRole(state, executeId);

  await channel.send(
    t(lang, "dayExecuted", {
      player: executeName,
      votes: executedNomination.finalVoteCount,
    }),
  );

  runtime.lastExecutedPlayerId = executeId;
  updateGame(state);

  // Saint check — must happen before killing so we can reference the role
  if (executeRole.id === "saint") {
    await channel.send(t(lang, "daySaintExecuted", { player: executeName }));
    // Saint is still killed before calling endGame
    const ps = ensureRuntime(state).playerStates.get(executeId);
    if (ps) ps.alive = false;
    updateGame(state);
    await endGame(client, state, channel, "good_saint_fail");
    return;
  }

  const gameEnded = await killPlayerDuringDay(
    client,
    state,
    channel,
    executeId,
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
  const nominatorRtState = runtime.playerStates.get(i.user.id);
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
  const nominee = resolvePlayer(nomineeInput, state);
  if (!nominee) {
    await i.reply({
      content: t(lang, "dayUnknownPlayer", { player: nomineeInput }),
      ephemeral: true,
    });
    return;
  }

  // Nominee must be alive
  const nomineeRtState = runtime.playerStates.get(nominee.userId);
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
  const nomineeRole = getRole(state, nominee.userId);
  const nominatorRealRole = getRole(state, i.user.id);

  // Virgin triggers if: nominee is Virgin, not poisoned, never nominated before,
  // and nominator's true role is Townsfolk (not Drunk, not Evil)
  const virginTriggered =
    nomineeRole.id === "virgin" &&
    !isPoisoned(state, nominee.userId) &&
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

    // Saint check for the Virgin-trigger execution target (the nominator)
    if (nominatorRealRole.id === "saint") {
      const ps = runtime.playerStates.get(i.user.id);
      if (ps) ps.alive = false;
      updateGame(state);
      await channel.send(
        t(lang, "daySaintExecuted", { player: nominator.displayName }),
      );
      await endGame(client, state, channel, "good_saint_fail");
      return;
    }

    const gameEnded = await killPlayerDuringDay(
      client,
      state,
      channel,
      i.user.id,
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

  const playerState = runtime.playerStates.get(i.user.id);
  const isAlive = playerState?.alive ?? false;

  if (!isAlive) {
    // Dead player uses ghost vote
    if (playerState?.ghostVoteUsed) {
      await i.reply({ content: t(lang, "dayGhostVoteUsed"), ephemeral: true });
      return;
    }
    // Mark ghost vote as used
    if (playerState) playerState.ghostVoteUsed = true;
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

// ── /slay command handler ─────────────────────────────────────────────────────

export async function handleSlay(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const lang = getLang(i.user.id);
  const state = getGame(i.channelId);

  if (!state || state.phase !== "in_progress") {
    await i.reply({ content: t(lang, "dayNoActiveGame"), ephemeral: true });
    return;
  }

  // Storyteller cannot use /slay
  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: t(lang, "dayStorytellerCannotSlay"),
      ephemeral: true,
    });
    return;
  }

  const player = state.players.find((p) => p.userId === i.user.id);
  if (!player) {
    await i.reply({ content: t(lang, "dayNotAPlayer"), ephemeral: true });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({ content: t(lang, "dayNotDaytime"), ephemeral: true });
    return;
  }

  // Must be alive to use /slay (dead players cannot slay)
  const playerState = runtime.playerStates.get(i.user.id);
  if (!playerState?.alive) {
    await i.reply({ content: t(lang, "dayDeadCannotSlay"), ephemeral: true });
    return;
  }

  const targetInput = i.options.getString("player", true);
  const target = resolvePlayer(targetInput, state);
  if (!target) {
    await i.reply({
      content: t(lang, "dayUnknownPlayer", { player: targetInput }),
      ephemeral: true,
    });
    return;
  }

  const targetState = runtime.playerStates.get(target.userId);
  if (!targetState?.alive) {
    await i.reply({
      content: t(lang, "daySlayTargetDead", { player: target.displayName }),
      ephemeral: true,
    });
    return;
  }

  // Determine the scenario
  const realRole = getRole(state, i.user.id);
  const targetRole = getRole(state, target.userId);
  const isRealSlayer = realRole.id === "slayer";
  const slayerPoisoned = isPoisoned(state, i.user.id);

  // Publicly announce the attempt
  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;
  await i.reply(
    t(lang, "daySlayAnnounce", {
      slayer: player.displayName,
      target: target.displayName,
    }),
  );

  // Scenario 1: Not the real Slayer (bluffing) or Drunk → nothing happens
  // Scenario 2: Real Slayer but poisoned → nothing happens (doesn't consume ability)
  // Scenario 3: Real Slayer, not poisoned, not used yet, target not Recluse
  // Scenario 4: Real Slayer, not poisoned, not used yet, target is Recluse

  if (!isRealSlayer) {
    // Scenario 1: bluffing
    if (state.mode === "manual") {
      daySession.pendingSlayFixed = {
        slayerId: i.user.id,
        targetId: target.userId,
        outcome: "nothing",
      };
      updateGame(state);
      await channel.send(t(lang, "daySlayPending"));
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        t(stLang, "daySlayBluffStNotify", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    } else {
      await channel.send(t(lang, "dayNothingHappens"));
      notifyStoryteller(
        client,
        state,
        t(lang, "daySlayBluffStLog", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    }
    return;
  }

  if (slayerPoisoned) {
    // Scenario 2: poisoned Slayer — doesn't consume ability
    if (state.mode === "manual") {
      daySession.pendingSlayFixed = {
        slayerId: i.user.id,
        targetId: target.userId,
        outcome: "nothing",
      };
      updateGame(state);
      await channel.send(t(lang, "daySlayPending"));
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        t(stLang, "daySlayPoisonedStNotify", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    } else {
      await channel.send(t(lang, "dayNothingHappens"));
      notifyStoryteller(
        client,
        state,
        t(lang, "daySlayPoisonedStLog", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    }
    return;
  }

  if (runtime.slayerHasUsed) {
    // Already used their ability — treated as Scenario 1 (nothing happens)
    if (state.mode === "manual") {
      daySession.pendingSlayFixed = {
        slayerId: i.user.id,
        targetId: target.userId,
        outcome: "nothing",
      };
      updateGame(state);
      await channel.send(t(lang, "daySlayPending"));
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        t(stLang, "daySlayUsedStNotify", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    } else {
      await channel.send(t(lang, "dayNothingHappens"));
      notifyStoryteller(
        client,
        state,
        t(lang, "daySlayUsedStLog", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    }
    return;
  }

  // Scenarios 3 & 4: Real Slayer, not poisoned, ability not yet used
  runtime.slayerHasUsed = true;
  updateGame(state);

  if (targetRole.id === "recluse") {
    // Scenario 4: Recluse target
    const proposedKill = Math.random() < 0.5;

    if (state.mode === "automated") {
      if (proposedKill) {
        await channel.send(
          t(lang, "daySlayRecluseKill", { target: target.displayName }),
        );
        const gameEnded = await killPlayerDuringDay(
          client,
          state,
          channel,
          target.userId,
        );
        if (!gameEnded && daySession.activeNomination) {
          // If target was current nominee, cancel the nomination
          if (daySession.activeNomination.nomineeId === target.userId) {
            await cancelActiveNomination(client, state, channel, target.userId);
          }
        }
      } else {
        await channel.send(t(lang, "daySlayRecluseNothing"));
      }
    } else {
      // Manual mode: storyteller decides
      daySession.pendingSlayRecluse = {
        slayerId: i.user.id,
        targetId: target.userId,
        proposedKill,
      };
      updateGame(state);

      await channel.send(t(lang, "daySlayPending"));

      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      const proposal = proposedKill
        ? t(stLang, "daySlayRecluseProposalKill")
        : t(stLang, "daySlayRecluseProposalNothing");
      notifyStoryteller(
        client,
        state,
        t(stLang, "daySlayRecluseStNotify", {
          slayer: player.displayName,
          target: target.displayName,
          proposal,
        }),
      );
    }
    return;
  }

  // Scenario 3: Real Slayer, not Recluse target
  if (targetRole.id === "imp") {
    // Demon dies
    if (state.mode === "manual") {
      daySession.pendingSlayFixed = {
        slayerId: i.user.id,
        targetId: target.userId,
        outcome: "kill",
      };
      updateGame(state);
      await channel.send(t(lang, "daySlayPending"));
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        t(stLang, "daySlayDemonStNotify", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    } else {
      await channel.send(
        t(lang, "daySlayDemonDies", { target: target.displayName }),
      );
      notifyStoryteller(
        client,
        state,
        t(lang, "daySlayDemonStLog", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
      const gameEnded = await killPlayerDuringDay(
        client,
        state,
        channel,
        target.userId,
      );
      if (!gameEnded) {
        if (daySession.activeNomination?.nomineeId === target.userId) {
          await cancelActiveNomination(client, state, channel, target.userId);
        }
      }
    }
  } else {
    // Not the Demon → nothing happens
    if (state.mode === "manual") {
      daySession.pendingSlayFixed = {
        slayerId: i.user.id,
        targetId: target.userId,
        outcome: "nothing",
      };
      updateGame(state);
      await channel.send(t(lang, "daySlayPending"));
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        t(stLang, "daySlayNotDemonStNotify", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    } else {
      await channel.send(t(lang, "dayNothingHappens"));
      notifyStoryteller(
        client,
        state,
        t(lang, "daySlayNotDemonStLog", {
          slayer: player.displayName,
          target: target.displayName,
        }),
      );
    }
  }
}

async function cancelActiveNomination(
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
function notifyStoryteller(
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
  const playerState = runtime.playerStates.get(i.user.id);
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

// ── Day-phase storyteller DM handler ─────────────────────────────────────────

/** Handle storyteller DM commands during the day phase. Returns true if handled. */
export async function handleDayStorytellerDm(
  message: Message,
  client: Client,
  state: GameState,
): Promise<boolean> {
  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;
  if (!daySession || daySession.status !== "open") return false;

  const stLang = getLang(message.author.id);
  const content = message.content.trim().toUpperCase();
  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;
  const lang = channelLang(state);

  // SLAY CONFIRM — broadcast the fixed outcome for Scenarios 1-3 in manual mode
  if (content === "SLAY CONFIRM") {
    const pending = daySession.pendingSlayFixed;
    if (!pending) {
      await message.reply(t(stLang, "daySlayNoPending"));
      return true;
    }

    const slayerName = playerDisplayName(state, pending.slayerId);
    const targetName = playerDisplayName(state, pending.targetId);

    daySession.pendingSlayFixed = null;
    updateGame(state);

    await message.reply(
      pending.outcome === "kill"
        ? t(stLang, "daySlayConfirmedKill")
        : t(stLang, "daySlayConfirmedNothing"),
    );

    if (pending.outcome === "kill") {
      await channel.send(
        t(lang, "daySlayConfirmKillAnnounce", {
          target: targetName,
          slayer: slayerName,
        }),
      );
      const gameEnded = await killPlayerDuringDay(
        client,
        state,
        channel,
        pending.targetId,
      );
      if (
        !gameEnded &&
        daySession.activeNomination?.nomineeId === pending.targetId
      ) {
        await cancelActiveNomination(client, state, channel, pending.targetId);
      }
    } else {
      await channel.send(t(lang, "dayNothingHappens"));
    }
    return true;
  }

  // SLAY KILL / SLAY NOTHING — resolve pending Recluse slay in manual mode
  if (content === "SLAY KILL" || content === "SLAY NOTHING") {
    const pending = daySession.pendingSlayRecluse;
    if (!pending) {
      await message.reply(t(stLang, "daySlayRecluseNoPending"));
      return true;
    }

    const kill = content === "SLAY KILL";
    daySession.pendingSlayRecluse = null;
    updateGame(state);

    const slayerName = playerDisplayName(state, pending.slayerId);
    const targetName = playerDisplayName(state, pending.targetId);

    await message.reply(
      kill
        ? t(stLang, "daySlayConfirmedKill")
        : t(stLang, "daySlayConfirmedNothing"),
    );

    if (kill) {
      await channel.send(
        t(lang, "daySlayConfirmKillAnnounce", {
          target: targetName,
          slayer: slayerName,
        }),
      );
      const gameEnded = await killPlayerDuringDay(
        client,
        state,
        channel,
        pending.targetId,
      );
      if (
        !gameEnded &&
        daySession.activeNomination?.nomineeId === pending.targetId
      ) {
        await cancelActiveNomination(client, state, channel, pending.targetId);
      }
    } else {
      await channel.send(t(lang, "daySlayRecluseNothing"));
    }
    return true;
  }

  return false;
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
