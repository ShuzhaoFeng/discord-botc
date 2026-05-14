/**
 * Day-phase flow control: day start and end-of-day tally. The game loop in
 * gameLoop.ts drives the night/day handoff. Nomination/vote primitives live
 * in nominations.ts; win-condition checks in winConditions.ts.
 */

import { Client, TextChannel } from "discord.js";
import { GameState, NominationRecord } from "./types";
import { t } from "../i18n";
import { updateGame } from "./state";
import {
  areChannelCommandsDisabled,
  channelLang,
  ensureRuntime,
  getAlivePlayers,
} from "./utils";
import { playerDisplayName } from "../utils/players";
import { killPlayer } from "./death";
import { maybeEndGame } from "./winConditions";

function getDayExecutions(state: GameState): string[] {
  const runtime = ensureRuntime(state);
  const dayNumber = runtime.daySession?.dayNumber;
  if (dayNumber === undefined) return [];

  return runtime.playerStates
    .filter(
      (ps) =>
        ps.death?.phase === "day" &&
        ps.death.byExecution === true &&
        ps.death.dayNumber === dayNumber,
    )
    .map((ps) => playerDisplayName(state, ps.player.userId));
}

export function runDayPhase(client: Client, state: GameState): Promise<void> {
  const runtime = ensureRuntime(state);
  return new Promise<void>((resolve, reject) => {
    runtime.phaseCompletion = resolve;
    startDayPhase(client, state).catch((err) => {
      runtime.phaseCompletion = null;
      reject(err);
    });
  });
}

function completeDayPhase(state: GameState): void {
  const runtime = ensureRuntime(state);
  const resolve = runtime.phaseCompletion;
  runtime.phaseCompletion = null;
  resolve?.();
}

async function startDayPhase(client: Client, state: GameState): Promise<void> {
  const runtime = ensureRuntime(state);
  const lang = channelLang(state);

  // Announcement only — these deaths were already applied during night
  // resolution via killPlayer.
  const nightKillIds = [...(runtime.nightKillIds ?? [])];
  runtime.nightKillIds = [];

  const dayNumber = runtime.nightNumber; // day N follows night N

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
    townsquareDeathByExecution: false,
  };
  updateGame(state);

  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;

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

  // Night-resolution skips per-death win checks; this is the catch-up.
  const ended = await maybeEndGame(client, state, channel, "death");
  if (ended) {
    completeDayPhase(state);
    return;
  }

  const alive = getAlivePlayers(state);
  const sep = lang === "zh" ? "、" : ", ";
  const aliveNames = alive.map((p) => p.displayName).join(sep);
  await channel.send(
    t(lang, "dayAlivePlayers", { count: alive.length, players: aliveNames }),
  );

  if (!areChannelCommandsDisabled(state)) {
    await channel.send(t(lang, "dayDiscussionOpen"));
  }
}

export async function processEndOfDay(
  client: Client,
  state: GameState,
  channel: TextChannel,
): Promise<void> {
  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession!;
  const lang = channelLang(state);

  daySession.status = "ended";
  updateGame(state);

  const completed = daySession.nominations.filter(
    (n) => n.status === "completed",
  );

  let executedNomination: NominationRecord | null = null;
  let maxVotes = 0;
  let tie = false;
  const dayExecutionNames = getDayExecutions(state);

  for (const nom of completed) {
    const required = Math.floor(nom.aliveThenCount / 2) + 1;
    if (nom.finalVoteCount < required) continue;

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
    if (dayExecutionNames.length > 0) {
      const sep = lang === "zh" ? "、" : ", ";
      await channel.send(
        t(lang, "dayExecutedTownsquare", {
          players: dayExecutionNames.join(sep),
        }),
      );
    } else {
      await channel.send(t(lang, "dayNoExecution"));
      await maybeEndGame(client, state, channel, "day_end_no_execution");
    }
  } else {
    const executeId = executedNomination.nomineeId;
    const executeName = playerDisplayName(state, executeId);

    await channel.send(
      t(lang, "dayExecuted", {
        player: executeName,
        votes: executedNomination.finalVoteCount,
      }),
    );

    await killPlayer(client, state, executeId, {
      phase: "day",
      byExecution: true,
      channel,
    });
  }

  if (state.phase === "in_progress") {
    await channel.send(t(lang, "dayNightFalls"));
  }
  completeDayPhase(state);
}
