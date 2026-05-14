/**
 * Owns the nomination & vote primitives (`/nominate`, `/ye`, `/endday`,
 * timer, threshold tracking). End-of-day tallying and the win check live
 * in dayFlow.ts and winConditions.ts.
 */

import { Client, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { GameState, NominationRecord } from "./types";
import { useTranslation, getLang, t } from "../i18n";
import { getGame, updateGame } from "./state";
import {
  areChannelCommandsDisabled,
  ensureRuntime,
  getAlivePlayers,
  getPlayerState,
  getRole,
  resolvePlayer,
  channelLang,
  registersAsTownsfolkForDetection,
} from "./utils";
import { playerDisplayName } from "../utils/players";
import { killPlayer, useGhostVote } from "./death";
import { processEndOfDay } from "./dayFlow";

// ── Nomination timer ─────────────────────────────────────────────────────────

const nominationTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function cancelNominationTimer(channelId: string): void {
  const timer = nominationTimers.get(channelId);
  if (timer !== undefined) {
    clearTimeout(timer);
    nominationTimers.delete(channelId);
  }
}

// ── Window close & finalize ──────────────────────────────────────────────────

async function closeNominationWindow(
  client: Client,
  channelId: string,
): Promise<void> {
  nominationTimers.delete(channelId);

  const state = getGame(channelId);
  if (!state || state.phase !== "in_progress") return;

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;
  if (!daySession?.activeNomination) return;

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

  const alivePlayers = getAlivePlayers(state);
  const aliveThenCount = alivePlayers.length;

  let voteCount = 0;
  for (const voterId of nomination.votes) {
    const voterPs = getPlayerState(runtime, voterId);
    if (voterPs?.role.id === "butler") {
      // Butler vote only counts if their master also voted by window close.
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

  const allNominated = checkAllNominated(state);
  if (allNominated && !daySession.dayEndsAfterNomination) {
    daySession.dayEndsAfterNomination = true;
    await channel.send(t(lang, "dayAllNominated"));
  }

  if (daySession.dayEndsAfterNomination && !daySession.activeNomination) {
    await processEndOfDay(client, state, channel);
  }
}

export function checkAllNominated(state: GameState): boolean {
  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession!;
  const alivePlayers = getAlivePlayers(state);
  return alivePlayers.every((p) => daySession.nomineeIds.has(p.userId));
}

// ── /nominate ────────────────────────────────────────────────────────────────

export async function handleNominate(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const state = getGame(i.channelId);
  const lang = getLang(i.user.id, state?.guildId ?? i.guildId);
  const tr = useTranslation(i.user.id, state?.guildId ?? i.guildId);

  if (!state || state.phase !== "in_progress") {
    await i.reply({ content: tr("dayNoActiveGame"), ephemeral: true });
    return;
  }

  if (areChannelCommandsDisabled(state)) return;

  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: tr("dayStorytellerCannotNominate"),
      ephemeral: true,
    });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({ content: tr("dayNominationsNotOpen"), ephemeral: true });
    return;
  }

  const nominator = state.players.find((p) => p.userId === i.user.id);
  if (!nominator) {
    await i.reply({ content: tr("dayNotAPlayer"), ephemeral: true });
    return;
  }

  const nominatorRtState = getPlayerState(runtime, i.user.id);
  if (!nominatorRtState?.alive) {
    await i.reply({ content: tr("dayDeadCannotNominate"), ephemeral: true });
    return;
  }

  if (daySession.nominatorIds.has(i.user.id)) {
    await i.reply({ content: tr("dayAlreadyNominated"), ephemeral: true });
    return;
  }

  if (daySession.endDayThresholdMet || daySession.dayEndsAfterNomination) {
    await i.reply({ content: tr("dayNoNewNominations"), ephemeral: true });
    return;
  }

  if (daySession.activeNomination) {
    await i.reply({
      content: tr("dayNominationInProgress"),
      ephemeral: true,
    });
    return;
  }

  const nomineeInput = i.options.getString("player", true);
  const nominee = resolvePlayer(nomineeInput, state.players);
  if (!nominee) {
    await i.reply({
      content: tr("dayUnknownPlayer", { player: nomineeInput }),
      ephemeral: true,
    });
    return;
  }

  const nomineeRtState = getPlayerState(runtime, nominee.userId);
  if (!nomineeRtState?.alive) {
    await i.reply({
      content: tr("dayNomineeDead", { player: nominee.displayName }),
      ephemeral: true,
    });
    return;
  }

  if (daySession.nomineeIds.has(nominee.userId)) {
    await i.reply({
      content: tr("dayAlreadyNominee", { player: nominee.displayName }),
      ephemeral: true,
    });
    return;
  }

  // ── Virgin check ──────────────────────────────────────────────────────────
  const nomineeRole = getRole(runtime, nominee.userId);
  const nominatorRealRole = getRole(runtime, i.user.id);
  const nominatorRegistersAsTownsfolk =
    nominatorRealRole.id === "spy"
      ? registersAsTownsfolkForDetection(nominatorRealRole)
      : nominatorRealRole.category === "Townsfolk";

  const virginTriggered =
    nomineeRole.id === "virgin" &&
    !(getPlayerState(runtime, nominee.userId)?.tags.has("poisoned") ?? false) &&
    nominatorRealRole.id !== "drunk" &&
    nominatorRegistersAsTownsfolk;

  daySession.nominatorIds.add(i.user.id);
  daySession.nomineeIds.add(nominee.userId);

  if (virginTriggered) {
    await i.reply(
      tr("dayNominateVirgin", {
        nominator: nominator.displayName,
        nominee: nominee.displayName,
      }),
    );

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
    updateGame(state);

    const channel = (await client.channels.fetch(
      state.channelId,
    )) as TextChannel;
    await channel.send(
      t(lang, "dayVirginTriggered", { nominator: nominator.displayName }),
    );

    const gameEnded = await killPlayer(client, state, i.user.id, {
      phase: "day",
      byExecution: true,
      channel,
    });
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
    votes: new Set([i.user.id]),
    finalVoteCount: 0,
    aliveThenCount: 0,
    windowClosedAt: 0,
    status: "active",
  };
  daySession.nominations.push(nomination);
  daySession.activeNomination = nomination;
  updateGame(state);

  await i.reply(
    tr("dayNominate", {
      nominator: nominator.displayName,
      nominee: nominee.displayName,
    }),
  );

  const timer = setTimeout(() => {
    closeNominationWindow(client, state.channelId).catch(console.error);
  }, 60_000);
  nominationTimers.set(state.channelId, timer);
}

// ── /ye ──────────────────────────────────────────────────────────────────────

export async function handleYe(
  i: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const state = getGame(i.channelId);
  const tr = useTranslation(i.user.id, state?.guildId ?? i.guildId);

  if (!state || state.phase !== "in_progress") {
    await i.reply({ content: tr("dayNoActiveGame"), ephemeral: true });
    return;
  }

  if (areChannelCommandsDisabled(state)) return;

  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: tr("dayStorytellerCannotVote"),
      ephemeral: true,
    });
    return;
  }

  const player = state.players.find((p) => p.userId === i.user.id);
  if (!player) {
    await i.reply({ content: tr("dayNotInGame"), ephemeral: true });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({ content: tr("dayVotingNotOpen"), ephemeral: true });
    return;
  }

  const nomination = daySession.activeNomination;
  if (!nomination || nomination.status !== "active") {
    await i.reply({ content: tr("dayNoActiveNomination"), ephemeral: true });
    return;
  }

  const playerState = getPlayerState(runtime, i.user.id);
  const isAlive = playerState?.alive ?? false;

  if (!isAlive) {
    const gv = useGhostVote(state, i.user.id);
    if (!gv.ok) {
      await i.reply({ content: tr("dayGhostVoteUsed"), ephemeral: true });
      return;
    }
  }

  if (nomination.votes.has(i.user.id)) {
    await i.reply({ content: tr("dayAlreadyVoted"), ephemeral: true });
    return;
  }

  nomination.votes.add(i.user.id);
  updateGame(state);

  const nomineeName = playerDisplayName(state, nomination.nomineeId);
  const ghostNote = !isAlive ? tr("dayGhostVoteExhausted") : "";
  await i.reply({
    content: tr("dayVoteRecorded", { nominee: nomineeName, ghostNote }),
    ephemeral: true,
  });
}

/** Idempotent. */
export async function cancelActiveNomination(
  _client: Client,
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

  if (daySession.dayEndsAfterNomination) {
    await processEndOfDay(_client, state, channel);
  }
}

// ── /endday ──────────────────────────────────────────────────────────────────

export async function handleEndDay(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const state = getGame(i.channelId);
  const lang = getLang(i.user.id, state?.guildId ?? i.guildId);
  const tr = useTranslation(i.user.id, state?.guildId ?? i.guildId);

  if (!state || state.phase !== "in_progress") {
    await i.reply({ content: tr("dayNoActiveGame"), ephemeral: true });
    return;
  }

  if (areChannelCommandsDisabled(state)) return;

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({ content: tr("dayNotDaytime"), ephemeral: true });
    return;
  }

  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;

  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: tr("dayEndedByStoryteller"),
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

  const player = state.players.find((p) => p.userId === i.user.id);
  if (!player) {
    await i.reply({ content: tr("dayNotInGame"), ephemeral: true });
    return;
  }

  const playerState = getPlayerState(runtime, i.user.id);
  if (!playerState?.alive) {
    await i.reply({ content: tr("dayNoted"), ephemeral: true });
    return;
  }

  if (daySession.endDayVotes.has(i.user.id)) {
    await i.reply({
      content: tr("dayAlreadyVotedEndDay"),
      ephemeral: true,
    });
    return;
  }

  daySession.endDayVotes.add(i.user.id);
  updateGame(state);

  const aliveCount = getAlivePlayers(state).length;
  const threshold = Math.floor(aliveCount / 2) + 1;
  const voteCount = daySession.endDayVotes.size;

  await i.reply({
    content: tr("dayEndDayVoteRecorded", { count: voteCount, threshold }),
    ephemeral: true,
  });

  if (voteCount >= threshold && !daySession.endDayThresholdMet) {
    daySession.endDayThresholdMet = true;
    daySession.dayEndsAfterNomination = true;
    updateGame(state);

    const suffix = daySession.activeNomination
      ? tr("dayEndDayThresholdSuffix")
      : "";
    await channel.send(
      tr("dayEndDayThreshold", { count: voteCount, total: aliveCount }) +
        suffix,
    );

    if (!daySession.activeNomination) {
      await processEndOfDay(client, state, channel);
    }
  }
}
