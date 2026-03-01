import {
  Client,
  ChatInputCommandInteraction,
  TextChannel,
  Message,
} from "discord.js";
import {
  GameState,
  DaySession,
  NominationRecord,
  Player,
  Lang,
  PlayerRuntimeState,
  RuntimeState,
} from "./types";
import { getLang } from "../i18n";
import { sendPlayerDm } from "../utils/sendPlayerDm";
import { getGame, updateGame } from "./state";
import { ROLE_BY_ID } from "./roles";
import { ensureRuntime } from "./night";

// ── Local helpers ─────────────────────────────────────────────────────────────

function tr(lang: Lang, en: string, zh: string): string {
  return lang === "zh" ? zh : en;
}

function getAlivePlayers(state: GameState): Player[] {
  const runtime = ensureRuntime(state);
  return state.players.filter((p) => runtime.playerStates.get(p.userId)?.alive);
}

function getRole(state: GameState, playerId: string) {
  return state.draft!.assignments.get(playerId)!;
}

function isDrunk(state: GameState, playerId: string): boolean {
  return getRole(state, playerId).id === "drunk";
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
    await channel.send(
      tr(
        lang,
        "🌟 **GOOD WINS!** The Demon has been slain. The town is saved!",
        "🌟 **善良阵营获胜！** 恶魔已被击杀。城镇得救了！",
      ),
    );
  } else if (winner === "evil") {
    await channel.send(
      tr(
        lang,
        "🩸 **EVIL WINS!** Only two souls remain. The Demon's dominion is complete.",
        "🩸 **邪恶阵营获胜！** 仅剩两名玩家存活。恶魔的统治已成定局。",
      ),
    );
  } else {
    await channel.send(
      tr(
        lang,
        "💀 **EVIL WINS!** The Saint was executed. Good has lost.",
        "💀 **邪恶阵营获胜！** 圣徒被处决，善良阵营落败。",
      ),
    );
  }

  // Role reveal
  const lines = state.players.map((p) => {
    const role = draft.assignments.get(p.userId)!;
    const ps = runtime.playerStates.get(p.userId)!;
    const aliveLabel = ps.alive
      ? tr(lang, "alive", "存活")
      : tr(lang, "dead", "死亡");
    const roleName = lang === "zh" ? role.nameZh : role.name;
    return `${p.displayName} — ${roleName} (${aliveLabel})`;
  });
  await channel.send(
    tr(
      lang,
      `**Game over. Final roles:**\n\`\`\`\n${lines.join("\n")}\n\`\`\``,
      `**游戏结束。最终角色：**\n\`\`\`\n${lines.join("\n")}\n\`\`\``,
    ),
  );
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
  await channel.send(
    tr(lang, `⚰️ **${name}** has died.`, `⚰️ **${name}** 死亡。`),
  );

  // Scarlet Woman check: if the dead player is the Imp and SW is alive with 5+ alive
  const deadRole = getRole(state, playerId);
  if (deadRole.id === "imp") {
    const alive = getAlivePlayers(state);
    const swPlayer = alive.find(
      (p) => getRole(state, p.userId).id === "scarlet_woman",
    );
    if (swPlayer && alive.length >= 5) {
      // SW becomes the new Imp
      const impRole = ROLE_BY_ID.get("imp")!;
      state.draft!.assignments.set(swPlayer.userId, impRole);
      updateGame(state);

      // Notify SW via DM
      const swLang = getLang(swPlayer.userId);
      await sendPlayerDm(
        client,
        swPlayer,
        state,
        tr(
          swLang,
          "🩸 The Demon has fallen. You are now the **Imp**. The game continues — act wisely.",
          "🩸 恶魔已倒下。你现在是 **小恶魔**。游戏继续——请谨慎行事。",
        ),
      );

      // If manual mode, also notify storyteller
      if (state.mode === "manual" && state.storytellerId) {
        try {
          const stUser = await client.users.fetch(state.storytellerId);
          const stLang = getLang(state.storytellerId);
          await stUser.send(
            tr(
              stLang,
              `⚡ Scarlet Woman triggered: **${swPlayer.displayName}** is now the Imp.`,
              `⚡ 红衣女触发：**${swPlayer.displayName}** 现在是小恶魔。`,
            ),
          );
        } catch {
          // Ignore DM failure
        }
      }

      await channel.send(
        tr(
          lang,
          "⚡ A dark power stirs in the shadows… the game continues.",
          "⚡ 暗影中涌现出黑暗力量……游戏继续。",
        ),
      );
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
    tr(
      lang,
      `🗳️ **Vote closed** for **${nomineeName}**: **${voteCount}** vote(s) (need ≥${required} to qualify for execution).`,
      `🗳️ **投票结束** — **${nomineeName}**：**${voteCount}** 票（需至少 ${required} 票才可被处决候选）。`,
    ),
  );

  updateGame(state);

  // Check if all alive players have now been nominated (day ends automatically)
  const allNominated = checkAllNominated(state);
  if (allNominated && !daySession.dayEndsAfterNomination) {
    daySession.dayEndsAfterNomination = true;
    await channel.send(
      tr(
        lang,
        "📋 All living players have been nominated — no further nominations are possible. The day ends.",
        "📋 所有存活玩家均已被提名——无法再开始新提名。今天结束。",
      ),
    );
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
    await channel.send(
      tr(
        lang,
        "⚖️ **No execution today.** No player received enough votes (or there was a tie).",
        "⚖️ **今日无处决。** 没有玩家获得足够票数（或出现平局）。",
      ),
    );

    // Mayor win condition: exactly 3 alive, no execution, Mayor is alive
    const alive = getAlivePlayers(state);
    if (alive.length === 3) {
      const mayorPlayer = alive.find(
        (p) => getRole(state, p.userId).id === "mayor",
      );
      if (mayorPlayer) {
        await channel.send(
          tr(
            lang,
            `🎖️ **${mayorPlayer.displayName}** (Mayor) invokes their power — **GOOD WINS!** Only 3 remain and no one was executed.`,
            `🎖️ **${mayorPlayer.displayName}**（市长）发动能力——**善良阵营获胜！** 仅剩3人且无人被处决。`,
          ),
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
    tr(
      lang,
      `⚔️ **${executeName}** has been executed! (${executedNomination.finalVoteCount} vote(s))`,
      `⚔️ **${executeName}** 被处决！（${executedNomination.finalVoteCount} 票）`,
    ),
  );

  runtime.lastExecutedPlayerId = executeId;
  updateGame(state);

  // Saint check — must happen before killing so we can reference the role
  if (executeRole.id === "saint") {
    await channel.send(
      tr(
        lang,
        `😱 **${executeName}** was the **Saint**! The Good team immediately loses!`,
        `😱 **${executeName}** 是**圣徒**！善良阵营立即落败！`,
      ),
    );
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
  await channel.send(
    tr(
      lang,
      "🌙 Night falls… Check your DMs for your night actions.",
      "🌙 夜幕降临……请查看私信以进行夜间行动。",
    ),
  );
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
    await channel.send(
      tr(
        lang,
        `☀️ **Day ${dayNumber}** dawns. The night was peaceful — no one died.`,
        `☀️ **第 ${dayNumber} 天** 开始。夜晚平静，无人死亡。`,
      ),
    );
  } else {
    const deathNames = nightKillIds
      .map((id) => playerDisplayName(state, id))
      .join(", ");
    await channel.send(
      tr(
        lang,
        `☀️ **Day ${dayNumber}** dawns. The following player(s) died during the night: **${deathNames}**.`,
        `☀️ **第 ${dayNumber} 天** 开始。以下玩家在夜间死亡：**${deathNames}**。`,
      ),
    );
  }

  // Check win conditions right after night deaths
  const gameEnded = await checkWinConditions(client, state, channel);
  if (gameEnded) return;

  // Announce alive players and open discussion
  const alive = getAlivePlayers(state);
  const aliveNames = alive
    .map((p) => p.displayName)
    .join(lang === "zh" ? "、" : ", ");
  await channel.send(
    tr(
      lang,
      `Players still alive (${alive.length}): ${aliveNames}\n\nFree discussion is open. Commands available:\n• \`/nominate <player>\` — nominate for execution\n• \`/ye\` — vote for the current nominee\n• \`/slay <player>\` — use Slayer ability\n• \`/endday\` — vote to end the day`,
      `存活玩家（${alive.length}）：${aliveNames}\n\n自由讨论开始。可用指令：\n• \`/nominate <玩家>\` — 提名处决\n• \`/ye\` — 为当前被提名者投票\n• \`/slay <玩家>\` — 使用屠魔者能力\n• \`/endday\` — 投票结束今天`,
    ),
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
    await i.reply({
      content: tr(
        lang,
        "❌ No active game in this channel.",
        "❌ 此频道没有进行中的游戏。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Storyteller cannot nominate
  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: tr(
        lang,
        "❌ The Storyteller cannot use `/nominate`.",
        "❌ 说书人不能使用 `/nominate`。",
      ),
      ephemeral: true,
    });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({
      content: tr(
        lang,
        "❌ Nominations are not open right now.",
        "❌ 当前不在提名阶段。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Must be a registered player
  const nominator = state.players.find((p) => p.userId === i.user.id);
  if (!nominator) {
    await i.reply({
      content: tr(
        lang,
        "❌ You are not a player in this game.",
        "❌ 你不是此局游戏的玩家。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Must be alive
  const nominatorRtState = runtime.playerStates.get(i.user.id);
  if (!nominatorRtState?.alive) {
    await i.reply({
      content: tr(
        lang,
        "❌ Dead players cannot nominate.",
        "❌ 死亡玩家不能提名。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Each player may nominate at most once per day
  if (daySession.nominatorIds.has(i.user.id)) {
    await i.reply({
      content: tr(
        lang,
        "❌ You have already nominated someone today.",
        "❌ 你今天已经提名过了。",
      ),
      ephemeral: true,
    });
    return;
  }

  // No new nominations after end condition triggered
  if (daySession.endDayThresholdMet || daySession.dayEndsAfterNomination) {
    await i.reply({
      content: tr(
        lang,
        "❌ The day is ending — no new nominations can be started.",
        "❌ 今天即将结束，不能再开始新的提名。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Cannot start if another nomination is active
  if (daySession.activeNomination) {
    await i.reply({
      content: tr(
        lang,
        "❌ A nomination is already in progress. Wait for the current vote to close.",
        "❌ 当前有提名进行中，请等待投票结束。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Resolve nominee
  const nomineeInput = i.options.getString("player", true);
  const nominee = resolvePlayer(nomineeInput, state);
  if (!nominee) {
    await i.reply({
      content: tr(
        lang,
        `❌ Unknown player: "${nomineeInput}".`,
        `❌ 未知玩家："${nomineeInput}"。`,
      ),
      ephemeral: true,
    });
    return;
  }

  // Nominee must be alive
  const nomineeRtState = runtime.playerStates.get(nominee.userId);
  if (!nomineeRtState?.alive) {
    await i.reply({
      content: tr(
        lang,
        `❌ **${nominee.displayName}** is dead and cannot be nominated.`,
        `❌ **${nominee.displayName}** 已死亡，不能被提名。`,
      ),
      ephemeral: true,
    });
    return;
  }

  // Each player may be nominated at most once per day
  if (daySession.nomineeIds.has(nominee.userId)) {
    await i.reply({
      content: tr(
        lang,
        `❌ **${nominee.displayName}** has already been nominated today.`,
        `❌ **${nominee.displayName}** 今天已被提名过。`,
      ),
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
      tr(
        lang,
        `📜 **${nominator.displayName}** nominates **${nominee.displayName}**.`,
        `📜 **${nominator.displayName}** 提名 **${nominee.displayName}**。`,
      ),
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
      tr(
        lang,
        `⚡ **Virgin** ability triggered! **${nominator.displayName}** (Townsfolk) is immediately executed for nominating the **Virgin**! The nomination closes with 0 votes.`,
        `⚡ **处女** 能力触发！**${nominator.displayName}**（镇民）因提名处女被立即处决！提名以 0 票关闭。`,
      ),
    );

    // Saint check for the Virgin-trigger execution target (the nominator)
    if (nominatorRealRole.id === "saint") {
      const ps = runtime.playerStates.get(i.user.id);
      if (ps) ps.alive = false;
      updateGame(state);
      await channel.send(
        tr(
          lang,
          `😱 **${nominator.displayName}** was the **Saint**! The Good team immediately loses!`,
          `😱 **${nominator.displayName}** 是**圣徒**！善良阵营立即落败！`,
        ),
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
    tr(
      lang,
      `📜 **${nominator.displayName}** nominates **${nominee.displayName}** for execution! Vote with \`/ye\` within **1 minute**. (${nominator.displayName}'s vote is automatic.)`,
      `📜 **${nominator.displayName}** 提名 **${nominee.displayName}** 受到处决！在 **1分钟** 内用 \`/ye\` 投票。（${nominator.displayName} 的票已自动计入。）`,
    ),
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
    await i.reply({
      content: tr(
        lang,
        "❌ No active game in this channel.",
        "❌ 此频道没有进行中的游戏。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Storyteller cannot vote
  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: tr(
        lang,
        "❌ The Storyteller cannot vote.",
        "❌ 说书人不能投票。",
      ),
      ephemeral: true,
    });
    return;
  }

  const player = state.players.find((p) => p.userId === i.user.id);
  if (!player) {
    await i.reply({
      content: tr(
        lang,
        "❌ You are not in this game.",
        "❌ 你不在此局游戏中。",
      ),
      ephemeral: true,
    });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({
      content: tr(
        lang,
        "❌ Voting is not open right now.",
        "❌ 当前不在投票阶段。",
      ),
      ephemeral: true,
    });
    return;
  }

  const nomination = daySession.activeNomination;
  if (!nomination || nomination.status !== "active") {
    await i.reply({
      content: tr(
        lang,
        "❌ No active nomination to vote on.",
        "❌ 当前没有进行中的提名。",
      ),
      ephemeral: true,
    });
    return;
  }

  const playerState = runtime.playerStates.get(i.user.id);
  const isAlive = playerState?.alive ?? false;

  if (!isAlive) {
    // Dead player uses ghost vote
    if (playerState?.ghostVoteUsed) {
      await i.reply({
        content: tr(
          lang,
          "❌ Your ghost vote has already been used. You have no more votes.",
          "❌ 你的亡灵一票已经使用过了。你没有更多投票机会。",
        ),
        ephemeral: true,
      });
      return;
    }
    // Mark ghost vote as used
    if (playerState) playerState.ghostVoteUsed = true;
  }

  if (nomination.votes.has(i.user.id)) {
    await i.reply({
      content: tr(
        lang,
        "❌ You have already voted on this nomination.",
        "❌ 你已经为这次提名投票了。",
      ),
      ephemeral: true,
    });
    return;
  }

  nomination.votes.add(i.user.id);
  updateGame(state);

  const nomineeName = playerDisplayName(state, nomination.nomineeId);
  const ghostNote = !isAlive
    ? tr(lang, " (ghost vote — now exhausted)", " （亡灵票——已耗尽）")
    : "";
  await i.reply({
    content: tr(
      lang,
      `✅ Your vote for **${nomineeName}** has been recorded.${ghostNote}`,
      `✅ 你对 **${nomineeName}** 的投票已记录。${ghostNote}`,
    ),
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
    await i.reply({
      content: tr(
        lang,
        "❌ No active game in this channel.",
        "❌ 此频道没有进行中的游戏。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Storyteller cannot use /slay
  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: tr(
        lang,
        "❌ The Storyteller cannot use `/slay`.",
        "❌ 说书人不能使用 `/slay`。",
      ),
      ephemeral: true,
    });
    return;
  }

  const player = state.players.find((p) => p.userId === i.user.id);
  if (!player) {
    await i.reply({
      content: tr(
        lang,
        "❌ You are not a player in this game.",
        "❌ 你不是此局游戏的玩家。",
      ),
      ephemeral: true,
    });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({
      content: tr(
        lang,
        "❌ It is not daytime right now.",
        "❌ 当前不是白天阶段。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Must be alive to use /slay (dead players cannot slay)
  const playerState = runtime.playerStates.get(i.user.id);
  if (!playerState?.alive) {
    await i.reply({
      content: tr(
        lang,
        "❌ Dead players cannot use `/slay`.",
        "❌ 死亡玩家不能使用 `/slay`。",
      ),
      ephemeral: true,
    });
    return;
  }

  const targetInput = i.options.getString("player", true);
  const target = resolvePlayer(targetInput, state);
  if (!target) {
    await i.reply({
      content: tr(
        lang,
        `❌ Unknown player: "${targetInput}".`,
        `❌ 未知玩家："${targetInput}"。`,
      ),
      ephemeral: true,
    });
    return;
  }

  const targetState = runtime.playerStates.get(target.userId);
  if (!targetState?.alive) {
    await i.reply({
      content: tr(
        lang,
        `❌ **${target.displayName}** is already dead.`,
        `❌ **${target.displayName}** 已经死亡了。`,
      ),
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
    tr(
      lang,
      `⚔️ **${player.displayName}** claims to be the Slayer and targets **${target.displayName}**!`,
      `⚔️ **${player.displayName}** 自称屠魔者并指向 **${target.displayName}**！`,
    ),
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
      await channel.send(
        tr(
          lang,
          "⏳ The outcome of the slay is pending Storyteller confirmation.",
          "⏳ 屠杀结果等待说书人确认。",
        ),
      );
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        stLang,
        tr(
          stLang,
          `SLAY: ${player.displayName} targeted ${target.displayName}. But ${player.displayName} is not the slayer - that's just bluffing. Nothing happens.\nReply \`SLAY CONFIRM\` to confirm their fate.`,
          `屠杀：${player.displayName} 指向 ${target.displayName}。但 ${player.displayName} 不是屠魔者——虚张声势而已。无事发生。\n回复 \`SLAY CONFIRM\` 以确认他们的命运。`,
        ),
      );
    } else {
      await channel.send(
        tr(lang, "🌫️ Nothing happens.", "🌫️ 什么都没有发生。"),
      );
      notifyStoryteller(
        client,
        state,
        lang,
        tr(
          lang,
          `SLAY: ${player.displayName} targeted ${target.displayName}. But ${player.displayName} is not the slayer - that's just bluffing. Nothing happens.`,
          `屠杀：${player.displayName} 指向 ${target.displayName}。但 ${player.displayName} 不是屠魔者——虚张声势而已。无事发生。`,
        ),
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
      await channel.send(
        tr(
          lang,
          "⏳ The outcome of the slay is pending Storyteller confirmation.",
          "⏳ 屠杀结果等待说书人确认。",
        ),
      );
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        stLang,
        tr(
          stLang,
          `SLAY: ${player.displayName} targeted ${target.displayName}. ${player.displayName} is the Slayer, but is poisoned. Nothing happens, and the ability is not consumed.\nReply \`SLAY CONFIRM\` to confirm their fate.`,
          `屠杀：${player.displayName} 指向 ${target.displayName}。${player.displayName} 是屠魔者，但中毒了。无事发生，能力未耗尽。\n回复 \`SLAY CONFIRM\` 以确认他们的命运。`,
        ),
      );
    } else {
      await channel.send(
        tr(lang, "🌫️ Nothing happens.", "🌫️ 什么都没有发生。"),
      );
      notifyStoryteller(
        client,
        state,
        lang,
        tr(
          lang,
          `SLAY: ${player.displayName} targeted ${target.displayName}. ${player.displayName} is the Slayer, but is poisoned. Nothing happens, and the ability is not consumed.`,
          `屠杀：${player.displayName} 指向 ${target.displayName}。${player.displayName} 是屠魔者，但中毒了。无事发生，能力未耗尽。`,
        ),
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
      await channel.send(
        tr(
          lang,
          "⏳ The outcome of the slay is pending Storyteller confirmation.",
          "⏳ 屠杀结果等待说书人确认。",
        ),
      );
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        stLang,
        tr(
          stLang,
          `SLAY: ${player.displayName} targeted ${target.displayName}. ${player.displayName} is the Slayer, but the slay ability is already consumed. Nothing happens.\nReply \`SLAY CONFIRM\` to confirm their fate.`,
          `屠杀：${player.displayName} 指向 ${target.displayName}。${player.displayName} 是屠魔者，但能力已使用。无事发生。\n回复 \`SLAY CONFIRM\` 以确认他们的命运。`,
        ),
      );
    } else {
      await channel.send(
        tr(lang, "🌫️ Nothing happens.", "🌫️ 什么都没有发生。"),
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
          tr(
            lang,
            `💀 **${target.displayName}** (registering as the Demon) is slain!`,
            `💀 **${target.displayName}**（被识别为恶魔）被屠杀！`,
          ),
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
        await channel.send(
          tr(
            lang,
            `🌫️ Nothing happens. (The Recluse does not register as the Demon.)`,
            `🌫️ 什么都没有发生。（隐士未被识别为恶魔。）`,
          ),
        );
      }
    } else {
      // Manual mode: storyteller decides
      daySession.pendingSlayRecluse = {
        slayerId: i.user.id,
        targetId: target.userId,
        proposedKill,
      };
      updateGame(state);

      await channel.send(
        tr(
          lang,
          `⏳ The outcome of the slay is pending Storyteller confirmation.`,
          `⏳ 屠杀结果等待说书人确认。`,
        ),
      );

      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      const proposal = proposedKill
        ? tr(
            stLang,
            "KILL the Recluse (registers as Demon)",
            "击杀隐士（被识别为恶魔）",
          )
        : tr(
            stLang,
            "NOTHING (Recluse does not register as Demon)",
            "无事发生（隐士未被识别为恶魔）",
          );
      notifyStoryteller(
        client,
        state,
        stLang,
        tr(
          stLang,
          `SLAY: ${player.displayName} (Slayer) targeted ${target.displayName} (Recluse).\nProposed: ${proposal}\nReply \`SLAY KILL\` to kill the Recluse, or \`SLAY NOTHING\` for no effect.`,
          `屠杀：${player.displayName}（屠魔者）指向 ${target.displayName}（隐士）。\n建议：${proposal}\n回复 \`SLAY KILL\` 击杀隐士，或 \`SLAY NOTHING\` 无事发生。`,
        ),
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
      await channel.send(
        tr(
          lang,
          "⏳ The outcome of the slay is pending Storyteller confirmation.",
          "⏳ 屠杀结果等待说书人确认。",
        ),
      );
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        stLang,
        tr(
          stLang,
          `SLAY: ${player.displayName} (Slayer) targeted ${target.displayName} (Demon). Demon dies.\nReply \`SLAY CONFIRM\` to confirm their fate.`,
          `屠杀：${player.displayName}（屠魔者）指向 ${target.displayName}（恶魔）。恶魔死亡。\n回复 \`SLAY CONFIRM\` 以确认他们的命运。`,
        ),
      );
    } else {
      await channel.send(
        tr(
          lang,
          `💀 **${target.displayName}** is the **Demon** — slain by the Slayer!`,
          `💀 **${target.displayName}** 是**恶魔**——被屠魔者击杀！`,
        ),
      );
      notifyStoryteller(
        client,
        state,
        lang,
        tr(
          lang,
          `SLAY: ${player.displayName} (Slayer) killed ${target.displayName} (Demon).`,
          `屠杀：${player.displayName}（屠魔者）击杀 ${target.displayName}（恶魔）。`,
        ),
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
      await channel.send(
        tr(
          lang,
          "⏳ The outcome of the slay is pending Storyteller confirmation.",
          "⏳ 屠杀结果等待说书人确认。",
        ),
      );
      const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
      notifyStoryteller(
        client,
        state,
        stLang,
        tr(
          stLang,
          `SLAY: ${player.displayName} (Slayer) targeted ${target.displayName} (not the Demon). Nothing happens.\nReply \`SLAY CONFIRM\` to confirm their fate.`,
          `屠杀：${player.displayName}（屠魔者）指向 ${target.displayName}（非恶魔）。无事发生。\n回复 \`SLAY CONFIRM\` 以确认他们的命运。`,
        ),
      );
    } else {
      await channel.send(
        tr(lang, "🌫️ Nothing happens.", "🌫️ 什么都没有发生。"),
      );
      notifyStoryteller(
        client,
        state,
        lang,
        tr(
          lang,
          `SLAY: ${player.displayName} (Slayer) targeted ${target.displayName} (not the Demon). Nothing happens.`,
          `屠杀：${player.displayName}（屠魔者）指向 ${target.displayName}（非恶魔）。无事发生。`,
        ),
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

  await channel.send(
    tr(
      lang,
      `📋 The nomination of **${killedName}** is cancelled — they have died.`,
      `📋 对 **${killedName}** 的提名已取消——该玩家已死亡。`,
    ),
  );
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
  lang: Lang,
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
    await i.reply({
      content: tr(
        lang,
        "❌ No active game in this channel.",
        "❌ 此频道没有进行中的游戏。",
      ),
      ephemeral: true,
    });
    return;
  }

  const runtime = ensureRuntime(state);
  const daySession = runtime.daySession;

  if (!daySession || daySession.status !== "open") {
    await i.reply({
      content: tr(
        lang,
        "❌ It is not daytime right now.",
        "❌ 当前不是白天阶段。",
      ),
      ephemeral: true,
    });
    return;
  }

  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;

  // Storyteller /endday ends the day immediately
  if (state.storytellerId === i.user.id) {
    await i.reply({
      content: tr(
        lang,
        "✅ Day ended by Storyteller.",
        "✅ 说书人结束了今天。",
      ),
      ephemeral: true,
    });
    daySession.dayEndsAfterNomination = true;
    updateGame(state);

    if (!daySession.activeNomination) {
      await processEndOfDay(client, state, channel);
    } else {
      await channel.send(
        tr(
          lang,
          "📋 The Storyteller has called for the day to end. The current vote will finish, then execution is decided.",
          "📋 说书人宣布今天结束。当前投票完成后，将进行处决结算。",
        ),
      );
    }
    return;
  }

  // Players vote to end the day
  const player = state.players.find((p) => p.userId === i.user.id);
  if (!player) {
    await i.reply({
      content: tr(
        lang,
        "❌ You are not in this game.",
        "❌ 你不在此局游戏中。",
      ),
      ephemeral: true,
    });
    return;
  }

  // Dead players' /endday is silently ignored
  const playerState = runtime.playerStates.get(i.user.id);
  if (!playerState?.alive) {
    await i.reply({
      content: tr(lang, "✅ Noted.", "✅ 已记录。"),
      ephemeral: true,
    });
    return;
  }

  // Already voted
  if (daySession.endDayVotes.has(i.user.id)) {
    await i.reply({
      content: tr(
        lang,
        "❌ You have already used `/endday` today.",
        "❌ 你今天已经使用过 `/endday` 了。",
      ),
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
    content: tr(
      lang,
      `✅ Your vote to end the day has been recorded (${voteCount}/${threshold} needed).`,
      `✅ 你的结束当天投票已记录（${voteCount}/${threshold}）。`,
    ),
    ephemeral: true,
  });

  if (voteCount >= threshold && !daySession.endDayThresholdMet) {
    daySession.endDayThresholdMet = true;
    daySession.dayEndsAfterNomination = true;
    updateGame(state);

    await channel.send(
      tr(
        lang,
        `📋 The majority has voted to end the day (${voteCount}/${aliveCount} alive). No new nominations may be started.${daySession.activeNomination ? " The current vote will finish first." : ""}`,
        `📋 多数玩家投票结束今天（${voteCount}/${aliveCount} 存活）。不能再开始新提名。${daySession.activeNomination ? "当前投票结束后将进行处决结算。" : ""}`,
      ),
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
      await message.reply(
        tr(stLang, "No pending slay to confirm.", "当前没有待确认的屠杀。"),
      );
      return true;
    }

    const slayerName = playerDisplayName(state, pending.slayerId);
    const targetName = playerDisplayName(state, pending.targetId);

    daySession.pendingSlayFixed = null;
    updateGame(state);

    await message.reply(
      tr(
        stLang,
        `✅ Slay outcome confirmed: ${pending.outcome === "kill" ? "KILL" : "NOTHING"}.`,
        `✅ 屠杀结果已确认：${pending.outcome === "kill" ? "击杀" : "无事发生"}。`,
      ),
    );

    if (pending.outcome === "kill") {
      await channel.send(
        tr(
          lang,
          `💀 **${targetName}** is the **Demon** — slain by **${slayerName}**!`,
          `💀 **${targetName}** 是**恶魔**——被 **${slayerName}** 击杀！`,
        ),
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
      await channel.send(
        tr(lang, "🌫️ Nothing happens.", "🌫️ 什么都没有发生。"),
      );
    }
    return true;
  }

  // SLAY KILL / SLAY NOTHING — resolve pending Recluse slay in manual mode
  if (content === "SLAY KILL" || content === "SLAY NOTHING") {
    const pending = daySession.pendingSlayRecluse;
    if (!pending) {
      await message.reply(
        tr(
          stLang,
          "No pending Recluse slay to resolve.",
          "当前没有待确认的隐士屠杀。",
        ),
      );
      return true;
    }

    const kill = content === "SLAY KILL";
    daySession.pendingSlayRecluse = null;
    updateGame(state);

    const slayerName = playerDisplayName(state, pending.slayerId);
    const targetName = playerDisplayName(state, pending.targetId);

    await message.reply(
      tr(
        stLang,
        `✅ Slay outcome confirmed: ${kill ? "KILL" : "NOTHING"}.`,
        `✅ 屠杀结果已确认：${kill ? "击杀" : "无事发生"}。`,
      ),
    );

    if (kill) {
      await channel.send(
        tr(
          lang,
          `💀 **${targetName}** (registering as the Demon) is slain by **${slayerName}**!`,
          `💀 **${targetName}**（被识别为恶魔）被 **${slayerName}** 击杀！`,
        ),
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
      await channel.send(
        tr(
          lang,
          `🌫️ Nothing happens. (The Recluse does not register as the Demon.)`,
          `🌫️ 什么都没有发生。（隐士未被识别为恶魔。）`,
        ),
      );
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
