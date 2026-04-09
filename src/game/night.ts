import { Client, Message, TextChannel } from "discord.js";
import {
  GameState,
  Lang,
  NightOutcomeDraft,
  NightOutcomeMeta,
  NightPrompt,
  NightSession,
  Player,
  PlayerRuntimeState,
  Role,
} from "./types";
import { getLang, getRoleName, t } from "../i18n";
import { findRole, getScript } from "./roles";
import { sendPlayerDm } from "../utils/sendPlayerDm";
import { updateGame } from "./state";
import { ALL_ROLE_DEFINITIONS } from "../roles/index";
import type { NightGameCtx } from "../roles/types";
import { triggerDeathHandlers } from "./death";
import { ActiveGameState } from "./types";
import {
  channelLang,
  ensureRuntime,
  getAlivePlayers,
  getPlayerState,
  getRole,
  pick,
  playerDisplayName,
  notifyStoryteller,
  resolvePlayer,
} from "./utils";
import { logBotMessage, logPlayerMessage } from "../utils/chat-log";
import { getGuildSettings } from "../guild-settings";

function getHandlers(roleId: string) {
  return ALL_ROLE_DEFINITIONS.find((r) => r.id === roleId)?.nightHandlers;
}

function parsePlayerInput(raw: string): string[] {
  return raw
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCtx(
  state: GameState,
  client: Client,
  ps: PlayerRuntimeState,
  nightNumber: number,
  responses: Map<string, (string | null)[]>,
  lang: Lang,
): NightGameCtx {
  return {
    state: state as ActiveGameState,
    client,
    playerDisplayName: (userId) => playerDisplayName(state, userId),
    notifyStoryteller: (content) => notifyStoryteller(client, state, content),
    night: {
      player: ps.player,
      nightNumber,
      responses,
      lang,
      scriptRoles: getScript().roles,
    },
  };
}

/** Derives the action prompt i18n key from a role ID using the naming convention. */
function nightPromptKey(roleId: string): string {
  const pascal = roleId
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return `night${pascal}Prompt`;
}

async function getDadJoke(): Promise<string> {
  try {
    const response = await fetch("https://icanhazdadjoke.com/", {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`dadjoke ${response.status}`);
    const payload = (await response.json()) as { joke?: string };
    return payload.joke ?? "The stars are quiet tonight.";
  } catch {
    return "I tried to catch fog, but I mist. What do you think? Reply with one word.";
  }
}

export async function startNightPhase(
  client: Client,
  state: GameState,
): Promise<void> {
  const runtime = ensureRuntime(state);
  runtime.nightNumber += 1;
  runtime.nightKillIds = []; // clear previous night's kills
  runtime.nightKillIntentId = null;

  for (const ps of runtime.playerStates) {
    ps.tags.delete("protected");
    ps.tags.delete("poisoned");
  }

  const alivePlayers = getAlivePlayers(state);
  const prompts = new Map<string, NightPrompt>();
  const actionMessages = new Map<string, string>();
  const responses = new Map<string, (string | null)[]>();
  const infoMessages = new Map<string, string>();
  const infoOutcomeMeta = new Map<string, NightOutcomeMeta>();
  const infoOutcomeDrafts = new Map<string, NightOutcomeDraft>();

  const onlineMode = getGuildSettings(state.guildId).onlineMode;

  // First pass: build all prompts synchronously, identify which players need jokes.
  const nightNumber = runtime.nightNumber;
  const promptResults = alivePlayers.map((p) => {
    const ps = getPlayerState(runtime, p.userId)!;
    const lang = getLang(p.userId, state.guildId);
    const ctx = buildCtx(state, client, ps, nightNumber, responses, lang);
    const handlers = getHandlers(ps.effectiveRole.id);

    let prompt: NightPrompt;
    let message: string;

    if (handlers?.action?.active(nightNumber)) {
      const inputs = handlers.action.buildPrompt(ctx);
      prompt = {
        kind: "action",
        inputs,
        playerId: p.userId,
        effectiveRoleId: ps.effectiveRole.id,
      };
      message = t(lang, nightPromptKey(ps.effectiveRole.id));
    } else if (handlers?.info?.active(nightNumber)) {
      prompt = {
        kind: "info",
        inputs: [],
        playerId: p.userId,
        effectiveRoleId: ps.effectiveRole.id,
      };
      message = t(lang, "nightInfoPrompt");
    } else {
      prompt = {
        kind: "joke",
        inputs: [],
        playerId: p.userId,
        effectiveRoleId: ps.effectiveRole.id,
      };
      message = t(lang, "nightJokePrompt", { joke: "..." }); // replaced below
    }

    prompts.set(p.userId, prompt);
    return { player: p, prompt, message };
  });

  // Fetch all required jokes in parallel before sending any messages.
  // In online mode, skip joke fetching entirely — joke players get no messages.
  const jokePlayerIds = onlineMode
    ? []
    : promptResults
        .filter((r) => r.prompt.kind === "joke")
        .map((r) => r.player.userId);
  const fetchedJokes = await Promise.all(jokePlayerIds.map(() => getDadJoke()));
  const jokeByPlayerId = new Map(
    jokePlayerIds.map((id, i) => [id, fetchedJokes[i]]),
  );

  // Second pass: assemble actionMessages with pre-fetched jokes.
  // In online mode, only action players get an action message.
  for (const { player, prompt, message } of promptResults) {
    if (onlineMode && prompt.kind !== "action") continue;
    if (prompt.kind === "joke") {
      const lang = getLang(player.userId, state.guildId);
      const joke = jokeByPlayerId.get(player.userId)!;
      actionMessages.set(player.userId, t(lang, "nightJokePrompt", { joke }));
    } else {
      actionMessages.set(player.userId, message);
    }
  }

  // In online mode, only action players are pending (info/joke players don't respond).
  const pendingPlayers = onlineMode
    ? alivePlayers.filter(
        (p) => prompts.get(p.userId)?.kind === "action",
      )
    : alivePlayers;

  const session: NightSession = {
    nightNumber: runtime.nightNumber,
    status:
      state.mode === "manual"
        ? "awaiting_storyteller_action"
        : "awaiting_players",
    prompts,
    actionMessages,
    responses,
    pendingPlayerIds: pendingPlayers.map((p) => p.userId),
    infoMessages,
    infoOutcomeMeta,
    infoOutcomeDrafts,
    deathNarrativePlayers: new Map(),
    deathNarrativePendingIds: [],
    deathNarrativeResponses: new Map(),
    deathNarrativeConfirmations: new Map(),
    deathNarrativeDrafts: new Map(),
  };

  runtime.nightSession = session;

  if (state.mode === "automated") {
    for (const p of alivePlayers) {
      const message = actionMessages.get(p.userId);
      if (!message) continue;
      await sendPlayerDm(client, p, state, message);
    }

    const channel = (await client.channels.fetch(
      state.channelId,
    )) as TextChannel;
    await channel.send(
      t(channelLang(state), "nightBegins", { n: session.nightNumber }),
    );

    // In online mode, if no action players exist, resolve immediately.
    if (session.pendingPlayerIds.length === 0) {
      await resolveNightOutcomes(client, state);
      await proceedAfterResolution(client, state, session);
      return;
    }
  }

  updateGame(state);
}

function validatePromptResponse(
  content: string,
  prompt: NightPrompt,
  state: GameState,
  fromPlayer: Player,
): { ok: boolean; values?: (string | null)[]; error?: string } {
  const lang = getLang(fromPlayer.userId, state.guildId);

  if (prompt.kind === "info") {
    if (!content.trim())
      return { ok: false, error: t(lang, "nightPleaseSendReply") };
    return { ok: true, values: [] };
  }

  if (prompt.kind === "joke") {
    if (!content.trim())
      return { ok: false, error: t(lang, "nightPleaseSendReply") };
    return { ok: true, values: [content.trim()] };
  }

  // kind === "action": per-slot validation
  const inputs = prompt.inputs;
  const required = inputs.filter((i) => !i.optional).length;
  const max = inputs.length;

  const rawNames = parsePlayerInput(content);

  if (rawNames.length < required || rawNames.length > max) {
    return {
      ok: false,
      error: t(lang, "nightExpectedPlayerNames", {
        count: required === max ? required : `${required}-${max}`,
      }),
    };
  }

  const resolvedIds: string[] = [];
  for (let i = 0; i < rawNames.length; i++) {
    const rawName = rawNames[i];
    const p = resolvePlayer(rawName, state.players);
    if (!p)
      return {
        ok: false,
        error: t(lang, "nightUnknownPlayerGeneric", { name: rawName }),
      };
    if (inputs[i].allowSelf === false && p.userId === fromPlayer.userId) {
      return {
        ok: false,
        error: t(lang, "nightCannotChooseSelf"),
      };
    }
    resolvedIds.push(p.userId);
  }

  if (new Set(resolvedIds).size !== resolvedIds.length) {
    return { ok: false, error: t(lang, "nightChooseDistinctPlayers") };
  }

  // Pad to max length with null for omitted optional slots.
  const values: (string | null)[] = new Array(max).fill(null);
  for (let i = 0; i < resolvedIds.length; i++) {
    values[i] = resolvedIds[i];
  }

  return { ok: true, values };
}

function roleNameFor(lang: Lang, role: Role): string {
  return getRoleName(lang, role.id);
}

function boolWord(lang: Lang, value: boolean): string {
  return value ? t(lang, "nightBoolYes") : t(lang, "nightBoolNo");
}

function renderOutcomeDraft(
  state: GameState,
  recipientLang: Lang,
  draft: NightOutcomeDraft,
): string {
  if (draft.templateId === "pair_role_info") {
    const p1 = playerDisplayName(state, String(draft.fields.p1));
    const p2 = playerDisplayName(state, String(draft.fields.p2));
    const role = getScript().roles.find(
      (r) => r.id === String(draft.fields.role),
    );
    const roleName = role
      ? roleNameFor(recipientLang, role)
      : String(draft.fields.role);
    return t(recipientLang, "nightPairRoleInfo", { p1, p2, role: roleName });
  }

  if (draft.templateId === "empath_count") {
    const left = playerDisplayName(state, String(draft.fields.left));
    const right = playerDisplayName(state, String(draft.fields.right));
    const count = Number(draft.fields.count);
    return t(recipientLang, "nightEmpathCount", { left, right, count });
  }

  if (draft.templateId === "chef_count") {
    const count = Number(draft.fields.count);
    return t(recipientLang, "nightChefCount", { count });
  }

  if (draft.templateId === "fortune_result") {
    const yes = Boolean(draft.fields.yes);
    return t(recipientLang, "nightFortuneResult", {
      result: boolWord(recipientLang, yes),
    });
  }

  if (draft.templateId === "undertaker_role") {
    const roleId = String(draft.fields.role);
    const role = getScript().roles.find((r) => r.id === roleId);
    const roleName = role ? roleNameFor(recipientLang, role) : roleId;
    return t(recipientLang, "nightUndertakerRole", { role: roleName });
  }

  if (draft.templateId === "grimoire") {
    const runtime = ensureRuntime(state);
    const lines = runtime.playerStates.map((ps) => {
      const roleId = String(draft.fields[ps.player.displayName] ?? ps.role.id);
      const role = getScript().roles.find((r) => r.id === roleId);
      const roleName = role ? roleNameFor(recipientLang, role) : roleId;
      const aliveLabel = ps.alive
        ? t(recipientLang, "nightAlive")
        : t(recipientLang, "nightDead");
      const poisonLabel = ps.tags.has("poisoned")
        ? t(recipientLang, "nightPoisoned")
        : t(recipientLang, "nightSober");
      return `${ps.player.displayName} — ${roleName} | ${aliveLabel} | ${poisonLabel}`;
    });
    return t(recipientLang, "nightGrimoire", { grimoire: lines.join("\n") });
  }

  return t(recipientLang, "nightInteractionRecorded");
}

function validateAndNormalizeDraft(
  state: GameState,
  draft: NightOutcomeDraft,
  lang: Lang,
): string | null {
  if (draft.templateId !== "pair_role_info") return null;
  if (draft.allowArbitraryOverride) return null;
  const runtime = ensureRuntime(state);

  const p1 = String(draft.fields.p1);
  const p2 = String(draft.fields.p2);
  if (p1 === p2) {
    return t(lang, "nightDraftDifferentPlayers");
  }

  const pairCategory = String(draft.constraints?.pairCategory ?? "");
  if (!pairCategory) return null;

  const r1 = getRole(runtime, p1);
  const r2 = getRole(runtime, p2);
  const candidates = [r1, r2].filter((r) => r.category === pairCategory);
  if (candidates.length === 0) {
    return t(lang, "nightDraftNoPairCategory", { category: pairCategory });
  }

  const currentRoleId = String(draft.fields.role);
  const candidateIds = new Set(candidates.map((r) => r.id));
  if (candidateIds.has(currentRoleId)) return null;

  // Auto-resolve role to a truthful option when role field is not editable.
  draft.fields.role = candidates[0].id;
  return null;
}

async function resolveNightOutcomes(
  client: Client,
  state: GameState,
): Promise<void> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return;

  for (const p of state.players) {
    const lang = getLang(p.userId, state.guildId);
    session.infoMessages.set(p.userId, t(lang, "nightInteractionRecorded"));
    session.infoOutcomeMeta.set(p.userId, {
      kind: "fixed",
      reasonKey: "nightReasonDeterministic",
    });
    session.infoOutcomeDrafts.delete(p.userId);
  }

  // Pass 1 — action resolves.
  for (const [playerId, values] of session.responses.entries()) {
    const actorPs = getPlayerState(runtime, playerId);
    if (!actorPs?.alive) continue;
    const handlers = getHandlers(actorPs.effectiveRole.id);
    if (!handlers?.action) continue;

    // Drunk experiences the ability prompt but resolve has no effect on game state.
    if (actorPs.role.id === "drunk") continue;

    const lang = getLang(playerId, state.guildId);
    const ctx = buildCtx(
      state,
      client,
      actorPs,
      session.nightNumber,
      session.responses,
      lang,
    );
    handlers.action.resolve(ctx, values);
  }

  // Core kill resolution — runs after all action resolves.
  // Track whether the Imp killed themselves so we can promote a Minion later if needed.
  let impKilledSelf = false;
  if (runtime.nightKillIntentId !== null) {
    const targetId = runtime.nightKillIntentId;
    const impPs = runtime.playerStates.find((ps) => ps.role.id === "imp");
    impKilledSelf = impPs != null && targetId === impPs.player.userId;
    const targetPs = getPlayerState(runtime, targetId);

    if (targetPs?.alive) {
      if (targetPs.role.id === "soldier") {
        // Soldier is immune — kill blocked.
      } else if (targetPs.tags.has("protected")) {
        // Monk protection — kill blocked.
      } else if (targetPs.role.id === "mayor" && Math.random() < 0.5) {
        // Mayor redirect — kill goes to a random other alive player.
        const candidates = getAlivePlayers(state).filter(
          (p) => p.userId !== targetId,
        );
        const redirected = pick(candidates, 1)[0];
        if (redirected) {
          runtime.nightKillIds.push(redirected.userId);
        }
      } else {
        runtime.nightKillIds.push(targetId);
      }
    }

    runtime.nightKillIntentId = null;
  }

  // Apply kills before info compute — a player who dies this night does not receive their information.
  for (const killedId of runtime.nightKillIds) {
    const killedPs = getPlayerState(runtime, killedId);
    if (killedPs) killedPs.alive = false;
  }

  // Pass 2 — info compute. Runs with post-kill state; dead players are skipped.
  for (const ps of runtime.playerStates) {
    if (!ps.alive) continue;
    const handlers = getHandlers(ps.effectiveRole.id);
    if (!handlers?.info?.active(session.nightNumber)) continue;

    const lang = getLang(ps.player.userId, state.guildId);
    const ctx = buildCtx(
      state,
      client,
      ps,
      session.nightNumber,
      session.responses,
      lang,
    );
    const draft = handlers.info.compute(ctx);

    if (draft === null) {
      const msgKey = handlers.info.nullMsgKey ?? "nightNoExecution";
      const reasonKey = handlers.info.nullReasonKey ?? "nightReasonNoExecution";
      session.infoMessages.set(ps.player.userId, t(lang, msgKey));
      session.infoOutcomeDrafts.delete(ps.player.userId);
      session.infoOutcomeMeta.set(ps.player.userId, {
        kind: "fixed",
        reasonKey,
      });
    } else {
      session.infoOutcomeDrafts.set(ps.player.userId, draft);
      session.infoMessages.set(
        ps.player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.infoOutcomeMeta.set(ps.player.userId, {
        kind: Object.keys(draft.fieldTypes).length > 0 ? "randomized" : "fixed",
        reasonKey:
          ps.role.id === "drunk" || ps.tags.has("poisoned")
            ? "nightReasonFalseInfo"
            : draft.reasonKey,
      });
    }
  }

  // Trigger death handlers for every player who died this night.
  // (Kills were already applied above, before info compute.)
  for (const killedId of runtime.nightKillIds) {
    await triggerDeathHandlers(
      client,
      state as ActiveGameState,
      killedId,
      "night",
      false,
    );
  }

  // Death narrative setup — for every killed player, replace their info message
  // with a death prompt and register them in the death narrative phase.
  for (const killedId of runtime.nightKillIds) {
    const killedPlayer = state.players.find((p) => p.userId === killedId);
    if (!killedPlayer) continue;
    const lang = getLang(killedId, state.guildId);
    // Ravenkeeper kind may have been set by the death handler; default to "simple".
    const kind = session.deathNarrativePlayers.get(killedId) ?? "simple";
    session.deathNarrativePlayers.set(killedId, kind);
    session.deathNarrativePendingIds.push(killedId);
    const promptKey =
      kind === "ravenkeeper"
        ? "nightRavenkeeperDeathPrompt"
        : "nightDeathNarrativePrompt";
    session.infoMessages.set(killedId, t(lang, promptKey));
    session.infoOutcomeDrafts.delete(killedId);
    session.infoOutcomeMeta.set(killedId, {
      kind: "fixed",
      reasonKey:
        kind === "ravenkeeper"
          ? "nightReasonRavenkeeperDeath"
          : "nightReasonDeathNarrative",
    });
  }

  // Imp self-kill: if the Imp killed themselves and no alive Imp remains (i.e. Scarlet Woman
  // did not already promote), pick a random alive Minion to become the new Imp.
  let newImpPlayerId: string | null = null;
  if (impKilledSelf) {
    const anyAliveImp = runtime.playerStates.some(
      (ps) => ps.alive && ps.role.id === "imp",
    );
    if (!anyAliveImp) {
      const aliveMinions = runtime.playerStates.filter(
        (ps) => ps.alive && ps.role.category === "Minion",
      );
      if (aliveMinions.length > 0) {
        const newImpPs = pick(aliveMinions, 1)[0];
        const impRole = getScript().roles.find((r) => r.id === "imp")!;
        newImpPs.role = impRole;
        newImpPs.effectiveRole = impRole;
        if (state.draft)
          state.draft.assignments.set(newImpPs.player.userId, impRole);
        updateGame(state);
        newImpPlayerId = newImpPs.player.userId;
      }
    }
  }

  // Confirm choice recorded for action-only players (those without an info handler).
  for (const ps of runtime.playerStates) {
    if (!ps.alive) continue;
    const prompt = session.prompts.get(ps.player.userId);
    if (prompt?.kind !== "action") continue;
    const handlers = getHandlers(ps.effectiveRole.id);
    // Skip if this role also has an info handler — it already got info above.
    if (handlers?.info?.active(session.nightNumber)) continue;

    const lang = getLang(ps.player.userId, state.guildId);
    session.infoMessages.set(ps.player.userId, t(lang, "nightChoiceRecorded"));
    session.infoOutcomeDrafts.delete(ps.player.userId);
    session.infoOutcomeMeta.set(ps.player.userId, {
      kind: "fixed",
      reasonKey: "nightReasonActionAck",
    });
  }

  // Joke players: in online mode they get no interaction at all;
  // in in-person mode they get a response to their joke reply.
  const onlineMode = getGuildSettings(state.guildId).onlineMode;
  for (const ps of runtime.playerStates) {
    if (!ps.alive) continue;
    const prompt = session.prompts.get(ps.player.userId);
    if (prompt?.kind !== "joke") continue;
    if (onlineMode) {
      session.infoMessages.delete(ps.player.userId);
      session.infoOutcomeDrafts.delete(ps.player.userId);
      session.infoOutcomeMeta.delete(ps.player.userId);
    } else {
      const lang = getLang(ps.player.userId, state.guildId);
      session.infoMessages.set(ps.player.userId, t(lang, "nightJudgeJoke"));
      session.infoOutcomeDrafts.delete(ps.player.userId);
      session.infoOutcomeMeta.set(ps.player.userId, {
        kind: "fixed",
        reasonKey: "nightReasonJokeInteraction",
      });
    }
  }

  // Append the Imp promotion notice to the new Imp's info message (after all other
  // messages are finalized, so it always appears as a postscript regardless of role).
  if (newImpPlayerId !== null) {
    const lang = getLang(newImpPlayerId, state.guildId);
    const existing = session.infoMessages.get(newImpPlayerId) ?? "";
    session.infoMessages.set(
      newImpPlayerId,
      existing + "\n\n" + t(lang, "nightImpSelfKillNewImp"),
    );
  }
}

async function sendInfoMessages(
  client: Client,
  state: GameState,
): Promise<void> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return;

  for (const player of state.players) {
    const content = session.infoMessages.get(player.userId);
    if (!content) continue;
    await sendPlayerDm(client, player, state, content);
  }

  // If any killed players need to respond with death narratives, pause here.
  if (session.deathNarrativePendingIds.length > 0) {
    session.status = "awaiting_death_narrative";
    updateGame(state);
    return;
  }

  session.status = "completed";
  updateGame(state);

  // Hand off to the day phase (dynamic import avoids circular dependency)
  const { startDayPhase } = (await import("./day")) as {
    startDayPhase: (client: Client, state: GameState) => Promise<void>;
  };
  await startDayPhase(client, state);
}

export async function handleNightPlayerDm(
  message: Message,
  client: Client,
  state: GameState,
): Promise<boolean> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return false;

  const isParticipant = state.players.some(
    (p) => p.userId === message.author.id,
  );
  if (!isParticipant) return false;

  const player = state.players.find((p) => p.userId === message.author.id)!;
  logPlayerMessage(state.channelId, player.userId, message.content.trim());

  // Death narrative phase — dead players describe their death.
  if (session.status === "awaiting_death_narrative") {
    if (session.deathNarrativePendingIds.includes(player.userId)) {
      return await handleDeathNarrativeDm(message, client, state, player);
    }
    return false;
  }

  if (session.status !== "awaiting_players") return false;

  if (!getPlayerState(runtime, player.userId)?.alive) return true;

  const prompt = session.prompts.get(player.userId);
  if (!prompt) return false;

  const validation = validatePromptResponse(
    message.content.trim(),
    prompt,
    state,
    player,
  );
  const lang = getLang(player.userId, state.guildId);
  if (!validation.ok) {
    const errorReply = t(lang, "nightInvalidInput", {
      error: validation.error ?? "",
    });
    await message.reply(errorReply);
    logBotMessage(state.channelId, player.userId, errorReply);
    return true;
  }
  session.responses.set(player.userId, validation.values ?? []);
  session.pendingPlayerIds = session.pendingPlayerIds.filter(
    (id) => id !== player.userId,
  );
  updateGame(state);

  if (session.pendingPlayerIds.length === 0) {
    await resolveNightOutcomes(client, state);
    await proceedAfterResolution(client, state, session);
  }

  return true;
}

/**
 * Shared post-resolution step: either hand off to the storyteller for info
 * review (manual mode) or send info messages directly (automated mode).
 */
async function proceedAfterResolution(
  client: Client,
  state: GameState,
  session: NightSession,
): Promise<void> {
  if (state.mode === "manual") {
    session.status = "awaiting_storyteller_info";
    updateGame(state);
  } else {
    await sendInfoMessages(client, state);
  }
}

function renderDeathNarrativeConfirmation(
  state: GameState,
  playerId: string,
  kind: "simple" | "ravenkeeper",
  draft: { fields: Record<string, string> },
): string {
  const lang = getLang(playerId, state.guildId);
  if (kind === "ravenkeeper") {
    const target = state.players.find((p) => p.userId === draft.fields.target);
    return t(lang, "nightRavenkeeperDeathConfirm", {
      player: target?.displayName ?? draft.fields.target,
      role: getRoleName(lang, draft.fields.role),
    });
  }
  return t(lang, "nightDeathNarrativeConfirm");
}

/**
 * Handles a player's death narrative DM. For simple deaths: stores any non-empty
 * description. For Ravenkeeper deaths: parses `name, description` format, computes
 * the RK pick result, and stores the confirmation message.
 */
async function handleDeathNarrativeDm(
  message: Message,
  client: Client,
  state: GameState,
  player: Player,
): Promise<boolean> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession!;
  const lang = getLang(player.userId, state.guildId);
  const kind = session.deathNarrativePlayers.get(player.userId) ?? "simple";

  if (kind === "ravenkeeper") {
    const raw = message.content.trim();
    const commaIdx = raw.indexOf(",");
    if (commaIdx <= 0) {
      const err = t(lang, "nightRavenkeeperDeathInvalidFormat");
      await message.reply(err);
      logBotMessage(state.channelId, player.userId, err);
      return true;
    }

    const namePart = raw.slice(0, commaIdx).trim();
    const description = raw.slice(commaIdx + 1).trim();
    if (!namePart || !description) {
      const err = t(lang, "nightRavenkeeperDeathInvalidFormat");
      await message.reply(err);
      logBotMessage(state.channelId, player.userId, err);
      return true;
    }

    const target = resolvePlayer(namePart, state.players);
    if (!target) {
      const err = t(lang, "nightRavenkeeperDeathInvalidPlayer", {
        name: namePart,
      });
      await message.reply(err);
      logBotMessage(state.channelId, player.userId, err);
      return true;
    }

    const rkPs = getPlayerState(runtime, player.userId);
    const targetPs = getPlayerState(runtime, target.userId);
    const poisoned = rkPs?.tags.has("poisoned") ?? false;

    let shownRoleId: string;
    if (poisoned) {
      const trueId = targetPs?.role.id ?? "";
      const candidates = getScript().roles.filter((r) => r.id !== trueId);
      shownRoleId = (pick(candidates, 1)[0] ?? getScript().roles[0]).id;
    } else {
      shownRoleId = targetPs!.role.id;
    }

    const draft = {
      fields: { target: target.userId, role: shownRoleId },
      fieldTypes: poisoned
        ? ({ role: "role" } as Record<string, "role" | "player">)
        : {},
    };
    session.deathNarrativeDrafts.set(player.userId, draft);
    const confirmation = renderDeathNarrativeConfirmation(
      state,
      player.userId,
      "ravenkeeper",
      draft,
    );

    session.deathNarrativeResponses.set(player.userId, description);
    session.deathNarrativeConfirmations.set(player.userId, confirmation);
  } else {
    const description = message.content.trim();
    if (!description) {
      const err = t(lang, "nightDeathNarrativeInvalidFormat");
      await message.reply(err);
      logBotMessage(state.channelId, player.userId, err);
      return true;
    }
    session.deathNarrativeResponses.set(player.userId, description);
    session.deathNarrativeConfirmations.set(
      player.userId,
      t(lang, "nightDeathNarrativeConfirm"),
    );
  }

  session.deathNarrativePendingIds = session.deathNarrativePendingIds.filter(
    (id) => id !== player.userId,
  );
  updateGame(state);

  if (session.deathNarrativePendingIds.length === 0) {
    await proceedAfterDeathNarrative(client, state, session);
  }

  return true;
}

async function proceedAfterDeathNarrative(
  client: Client,
  state: GameState,
  session: NightSession,
): Promise<void> {
  if (state.mode === "manual") {
    session.status = "awaiting_storyteller_death_confirm";
    updateGame(state);
  } else {
    await sendDeathNarrativeConfirmations(client, state, session);
  }
}

async function sendDeathNarrativeConfirmations(
  client: Client,
  state: GameState,
  session: NightSession,
): Promise<void> {
  for (const [
    playerId,
    confirmation,
  ] of session.deathNarrativeConfirmations.entries()) {
    const player = state.players.find((p) => p.userId === playerId);
    if (!player) continue;
    await sendPlayerDm(client, player, state, confirmation);
  }

  session.status = "completed";
  updateGame(state);

  const { startDayPhase } = (await import("./day")) as {
    startDayPhase: (client: Client, state: GameState) => Promise<void>;
  };
  await startDayPhase(client, state);
}

export function getNightPendingPlayerNames(state: GameState): string[] {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session || session.status !== "awaiting_players") return [];
  return session.pendingPlayerIds.map((id) => playerDisplayName(state, id));
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

/**
 * Apply a draft field update from the storyteller UI.
 * Accepts pre-resolved values (userId for player, roleId for role, number, boolean).
 */
export function applyInfoDraftFieldForUI(
  state: GameState,
  playerId: string,
  field: string,
  resolvedValue: string | number | boolean,
): { message: string } | { error: string } {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return { error: "No active night session" };

  const draft = session.infoOutcomeDrafts.get(playerId);
  if (!draft) return { error: "No editable draft for this player" };

  const fieldType = draft.fieldTypes[field];
  if (!fieldType) return { error: `Field "${field}" is not editable` };

  const originalValue = draft.fields[field];

  if (fieldType === "player") {
    const exists = state.players.find(
      (p) => p.userId === String(resolvedValue),
    );
    if (!exists) return { error: `Unknown player: ${resolvedValue}` };
    draft.fields[field] = String(resolvedValue);
  } else if (fieldType === "role") {
    const role = findRole(String(resolvedValue));
    if (!role) return { error: `Unknown role: ${resolvedValue}` };
    draft.fields[field] = role.id;
  } else if (fieldType === "number") {
    const n = Number(resolvedValue);
    if (!Number.isFinite(n))
      return { error: `Invalid number: ${resolvedValue}` };
    draft.fields[field] = Math.trunc(n);
  } else {
    draft.fields[field] = Boolean(resolvedValue);
  }

  const stLang: Lang = "en";
  const err = validateAndNormalizeDraft(state, draft, stLang);
  if (err) {
    draft.fields[field] = originalValue;
    return { error: err };
  }

  session.infoOutcomeDrafts.set(playerId, draft);
  const player = state.players.find((p) => p.userId === playerId);
  if (!player) return { error: "Player not found" };

  const targetLang = getLang(player.userId, state.guildId);
  const message = renderOutcomeDraft(state, targetLang, draft);
  session.infoMessages.set(playerId, message);
  const prevMeta = session.infoOutcomeMeta.get(playerId);
  session.infoOutcomeMeta.set(playerId, {
    kind: prevMeta?.kind ?? "fixed",
    reasonKey: "nightReasonStorytellerSet",
    reasonParams: { field },
  });
  updateGame(state);
  return { message };
}

/** Send customized action messages to all alive players and transition to awaiting_players. */
export async function sendActionMessagesForUI(
  client: Client,
  state: GameState,
  customMessages: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session || session.status !== "awaiting_storyteller_action") {
    return { ok: false, error: "Not awaiting storyteller action" };
  }

  session.status = "awaiting_players";
  updateGame(state);

  for (const p of getAlivePlayers(state)) {
    const msg =
      customMessages[p.userId] ?? session.actionMessages.get(p.userId) ?? "";
    if (!msg) continue;
    session.actionMessages.set(p.userId, msg);
    await sendPlayerDm(client, p, state, msg);
  }

  updateGame(state);

  // In online mode, if no action players exist, resolve immediately.
  if (session.pendingPlayerIds.length === 0) {
    await resolveNightOutcomes(client, state);
    await proceedAfterResolution(client, state, session);
  }

  return { ok: true };
}

/** Override info messages with custom texts, then send them and transition to day phase. */
export async function sendInfoMessagesForUI(
  client: Client,
  state: GameState,
  customMessages: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session || session.status !== "awaiting_storyteller_info") {
    return { ok: false, error: "Not awaiting storyteller info" };
  }

  for (const [userId, text] of Object.entries(customMessages)) {
    session.infoMessages.set(userId, text);
  }

  await sendInfoMessages(client, state);
  return { ok: true };
}

/** Send all death narrative confirmations and transition to day phase. */
export async function sendDeathNarrativeConfirmationsForUI(
  client: Client,
  state: GameState,
  customMessages: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session || session.status !== "awaiting_storyteller_death_confirm") {
    return { ok: false, error: "Not awaiting storyteller death confirm" };
  }
  for (const [userId, text] of Object.entries(customMessages)) {
    session.deathNarrativeConfirmations.set(userId, text);
  }
  await sendDeathNarrativeConfirmations(client, state, session);
  return { ok: true };
}

/** Update an editable field in a death narrative draft and recompute the confirmation. */
export function applyDeathNarrativeDraftFieldForUI(
  state: GameState,
  playerId: string,
  field: string,
  value: string,
): { confirmation: string } | { error: string } {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return { error: "No active night session" };

  const draft = session.deathNarrativeDrafts.get(playerId);
  if (!draft) return { error: "No draft for this player" };

  const fieldType = draft.fieldTypes[field];
  if (!fieldType) return { error: `Field "${field}" is not editable` };

  if (fieldType === "role") {
    const role = findRole(value);
    if (!role) return { error: `Unknown role: ${value}` };
    draft.fields[field] = role.id;
  } else {
    const player = state.players.find((p) => p.userId === value);
    if (!player) return { error: `Unknown player: ${value}` };
    draft.fields[field] = value;
  }

  const kind = session.deathNarrativePlayers.get(playerId) ?? "simple";
  const confirmation = renderDeathNarrativeConfirmation(
    state,
    playerId,
    kind,
    draft,
  );
  session.deathNarrativeConfirmations.set(playerId, confirmation);
  updateGame(state);
  return { confirmation };
}
