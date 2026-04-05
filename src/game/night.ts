import { Client, Message, TextChannel, User } from "discord.js";
import {
  GameState,
  Lang,
  NightOutcomeDraft,
  NightOutcomeMeta,
  NightPrompt,
  NightSession,
  Player,
  PlayerRuntimeState,
  PlayerTag,
  Role,
  RuntimeState,
} from "./types";
import { getLang, getRoleName, t } from "../i18n";
import { findRole, getScript } from "./roles";
import { sendPlayerDm } from "../utils/sendPlayerDm";
import { updateGame } from "./state";
import { ALL_ROLE_DEFINITIONS } from "../roles/index";
import type { NightGameCtx } from "../roles/types";
import { triggerDeathHandlers } from "./death";
import { ActiveGameState } from "./types";
import { pick, getPlayerState, getRole } from "./utils";
import { logBotMessage, logPlayerMessage } from "../utils/chat-log";

function getHandlers(roleId: string) {
  return ALL_ROLE_DEFINITIONS.find((r) => r.id === roleId)?.nightHandlers;
}

export function ensureRuntime(state: GameState): RuntimeState {
  if (!state.runtime) {
    const draft = state.draft!;
    const playerStates: PlayerRuntimeState[] = state.players.map((p) => {
      const role = draft.assignments.get(p.userId)!;
      const effectiveRole =
        role.id === "drunk" && draft.drunkFakeRole ? draft.drunkFakeRole : role;
      const tags = new Set<PlayerTag>();
      if (draft.redHerring === p.userId) tags.add("red_herring");
      return { player: p, role, effectiveRole, alive: true, tags };
    });
    state.runtime = {
      nightNumber: 0,
      playerStates,
      nightSession: null,
      daySession: null,
      lastExecutedPlayerId: null,
      nightKillIds: [],
      nightKillIntentId: null,
      pendingEndGame: null,
    };
  }
  return state.runtime;
}

function parsePlayerInput(raw: string): string[] {
  return raw
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolvePlayerName(
  input: string,
  players: Player[],
): Player | undefined {
  const lower = input.toLowerCase();
  const exact = players.filter(
    (p) =>
      p.displayName.toLowerCase() === lower ||
      p.username.toLowerCase() === lower,
  );
  if (exact.length === 1) return exact[0];

  const prefix = players.filter(
    (p) =>
      p.displayName.toLowerCase().startsWith(lower) ||
      p.username.toLowerCase().startsWith(lower),
  );
  if (prefix.length === 1) return prefix[0];
  return undefined;
}

function getAlivePlayers(state: GameState): Player[] {
  const runtime = ensureRuntime(state);
  return runtime.playerStates.filter((ps) => ps.alive).map((ps) => ps.player);
}

function playerDisplayName(state: GameState, userId: string): string {
  return state.players.find((p) => p.userId === userId)?.displayName ?? userId;
}

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

  const promptPreviewLines: string[] = [];

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
    promptPreviewLines.push(`- ${p.displayName}: ${ps.effectiveRole.id}`);
    return { player: p, prompt, message };
  });

  // Fetch all required jokes in parallel before sending any messages.
  const jokePlayerIds = promptResults
    .filter((r) => r.prompt.kind === "joke")
    .map((r) => r.player.userId);
  const fetchedJokes = await Promise.all(jokePlayerIds.map(() => getDadJoke()));
  const jokeByPlayerId = new Map(
    jokePlayerIds.map((id, i) => [id, fetchedJokes[i]]),
  );

  // Second pass: assemble actionMessages with pre-fetched jokes.
  for (const { player, prompt, message } of promptResults) {
    if (prompt.kind === "joke") {
      const lang = getLang(player.userId, state.guildId);
      const joke = jokeByPlayerId.get(player.userId)!;
      actionMessages.set(player.userId, t(lang, "nightJokePrompt", { joke }));
    } else {
      actionMessages.set(player.userId, message);
    }
  }

  const session: NightSession = {
    nightNumber: runtime.nightNumber,
    status:
      state.mode === "manual"
        ? "awaiting_storyteller_action"
        : "awaiting_players",
    prompts,
    actionMessages,
    responses,
    pendingPlayerIds: alivePlayers.map((p) => p.userId),
    actionPreview: promptPreviewLines.join("\n"),
    infoMessages,
    infoOutcomeMeta,
    infoOutcomeDrafts,
    pendingRavenkeeperPick: null,
  };

  runtime.nightSession = session;

  if (state.mode === "manual" && state.storytellerId) {
    const storyteller = await client.users.fetch(state.storytellerId);
    const lang = getLang(storyteller.id, state.guildId);
    await storyteller.send(
      t(lang, "nightActionPreview", {
        n: session.nightNumber,
        preview: session.actionPreview ?? "",
      }),
    );
  }

  if (state.mode === "automated") {
    for (const p of alivePlayers) {
      const message = actionMessages.get(p.userId);
      if (!message) continue;
      await sendPlayerDm(client, p, state, message);
    }

    const channel = (await client.channels.fetch(
      state.channelId,
    )) as TextChannel;
    const channelLang = getLang(state.players[0]?.userId ?? "", state.guildId);
    await channel.send(
      t(channelLang, "nightBegins", { n: session.nightNumber }),
    );
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
    const p = resolvePlayerName(rawName, state.players);
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

function playerName(state: GameState, userId: string): string {
  return state.players.find((p) => p.userId === userId)?.displayName ?? userId;
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
    const p1 = playerName(state, String(draft.fields.p1));
    const p2 = playerName(state, String(draft.fields.p2));
    const role = getScript().roles.find(
      (r) => r.id === String(draft.fields.role),
    );
    const roleName = role
      ? roleNameFor(recipientLang, role)
      : String(draft.fields.role);
    return t(recipientLang, "nightPairRoleInfo", { p1, p2, role: roleName });
  }

  if (draft.templateId === "empath_count") {
    const left = playerName(state, String(draft.fields.left));
    const right = playerName(state, String(draft.fields.right));
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

function editableFields(draft: NightOutcomeDraft): string[] {
  return Object.keys(draft.fieldTypes);
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

function applyDraftFieldSet(
  state: GameState,
  draft: NightOutcomeDraft,
  field: string,
  rawValue: string,
  lang: Lang,
): string | null {
  const fieldType = draft.fieldTypes[field];
  if (!fieldType) {
    return t(lang, "nightDraftFieldNotEditable", {
      field,
      fields: editableFields(draft).join(", "),
    });
  }

  if (fieldType === "player") {
    const resolved = resolvePlayerName(rawValue, state.players);
    if (!resolved)
      return t(lang, "nightUnknownPlayerGeneric", { name: rawValue });
    draft.fields[field] = resolved.userId;
    return null;
  }

  if (fieldType === "role") {
    const role = findRole(rawValue);
    if (!role) return t(lang, "nightUnknownRole", { name: rawValue });
    draft.fields[field] = role.id;
    return null;
  }

  if (fieldType === "number") {
    const n = Number(rawValue);
    if (!Number.isFinite(n))
      return t(lang, "nightInvalidNumber", { value: rawValue });
    draft.fields[field] = Math.trunc(n);
    return null;
  }

  const lower = rawValue.trim().toLowerCase();
  if (["yes", "y", "true", "1", "是"].includes(lower)) {
    draft.fields[field] = true;
    return null;
  }
  if (["no", "n", "false", "0", "否"].includes(lower)) {
    draft.fields[field] = false;
    return null;
  }
  return t(lang, "nightInvalidBoolean", { value: rawValue });
}

function outcomeTag(lang: Lang, meta: NightOutcomeMeta | undefined): string {
  if (!meta || meta.kind === "fixed") {
    return t(lang, "nightOutcomeFixed");
  }
  return t(lang, "nightOutcomeRandom");
}

function outcomeReasonTag(
  lang: Lang,
  meta: NightOutcomeMeta | undefined,
): string {
  if (!meta || !meta.reasonKey) return "";
  return t(lang, "nightOutcomeReason", {
    reason: t(lang, meta.reasonKey, meta.reasonParams),
  });
}

function buildInfoPreview(state: GameState, storytellerLang: Lang): string {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return "";

  const previewLines: string[] = [];
  for (const p of state.players) {
    const msg = session.infoMessages.get(p.userId);
    if (!msg) continue;
    const meta = session.infoOutcomeMeta.get(p.userId);
    const draft = session.infoOutcomeDrafts.get(p.userId);
    const editable = draft ? editableFields(draft).join(",") : "";
    const editHint = draft
      ? t(storytellerLang, "nightEditableFields", { fields: editable })
      : "";
    previewLines.push(
      `${p.displayName}: ${outcomeTag(storytellerLang, meta)} ${outcomeReasonTag(storytellerLang, meta)} ${msg}${editHint}`,
    );
  }
  return previewLines.join("\n");
}

function humanizeRoleId(roleId: string): string {
  return roleId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildActionSummary(state: GameState, storytellerLang: Lang): string {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return "";

  const lines: string[] = [];
  for (const p of state.players) {
    const prompt = session.prompts.get(p.userId);
    if (!prompt) continue;

    const roleLabel = humanizeRoleId(prompt.effectiveRoleId);
    const values = session.responses.get(p.userId) ?? [];
    let detail = "";

    if (prompt.kind === "info") {
      detail = t(storytellerLang, "nightReadinessAck");
    } else if (prompt.kind === "joke") {
      const reply =
        (values.find((v) => v !== null) as string | undefined) ??
        t(storytellerLang, "nightNoText");
      detail = t(storytellerLang, "nightJokeReply", { reply });
    } else {
      const names = values
        .filter((v): v is string => v !== null)
        .map((uid) => playerName(state, uid));
      const sep = storytellerLang === "zh" ? "、" : ", ";
      detail =
        names.length > 0
          ? t(storytellerLang, "nightChose", { players: names.join(sep) })
          : t(storytellerLang, "nightNoTargets");
    }

    lines.push(`${p.displayName} (${roleLabel}): ${detail}`);
  }

  return lines.join("\n");
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

  // Imp self-kill: if the Imp killed themselves and no alive Imp remains (i.e. Scarlet Woman
  // did not already promote), pick a random alive Minion to become the new Imp.
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

        const newImpLang = getLang(newImpPs.player.userId, state.guildId);
        await sendPlayerDm(
          client,
          newImpPs.player,
          state,
          t(newImpLang, "nightImpSelfKillNewImp"),
        );

        if (state.mode === "manual" && state.storytellerId) {
          try {
            const stUser = await client.users.fetch(state.storytellerId);
            const stLang = getLang(state.storytellerId, state.guildId);
            await stUser.send(
              t(stLang, "nightImpSelfKillStorytellerNotify", {
                player: newImpPs.player.displayName,
              }),
            );
          } catch {
            // Ignore DM failure
          }
        }
      }
    }
  }

  // Confirm choice recorded for action-only players (those without an info handler).
  for (const ps of runtime.playerStates) {
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

  // Joke players get a response to their joke reply.
  for (const ps of runtime.playerStates) {
    const prompt = session.prompts.get(ps.player.userId);
    if (prompt?.kind !== "joke") continue;
    const lang = getLang(ps.player.userId, state.guildId);
    session.infoMessages.set(ps.player.userId, t(lang, "nightJudgeJoke"));
    session.infoOutcomeDrafts.delete(ps.player.userId);
    session.infoOutcomeMeta.set(ps.player.userId, {
      kind: "fixed",
      reasonKey: "nightReasonJokeInteraction",
    });
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

  // Ravenkeeper pick phase — the RK died this night and is choosing a player.
  if (session.status === "awaiting_ravenkeeper_pick") {
    if (session.pendingRavenkeeperPick === player.userId) {
      return await processRavenkeeperPickDm(message, client, state, player);
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

  const recordedReply = t(lang, "nightResponseRecorded");
  await message.reply(recordedReply);
  logBotMessage(state.channelId, player.userId, recordedReply);

  if (session.pendingPlayerIds.length === 0) {
    await resolveNightOutcomes(client, state);

    if (session.pendingRavenkeeperPick) {
      // RK died this night — wait for their pick before proceeding.
      session.status = "awaiting_ravenkeeper_pick";
      updateGame(state);
      return true;
    }

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
  if (state.mode === "manual" && state.storytellerId) {
    session.status = "awaiting_storyteller_info";
    const storyteller = await client.users.fetch(state.storytellerId);
    const stLang = getLang(storyteller.id, state.guildId);
    const actionSummary = buildActionSummary(state, stLang);
    session.infoPreview = buildInfoPreview(state, stLang);
    updateGame(state);
    await storyteller.send(
      t(stLang, "nightInfoPreview", {
        n: session.nightNumber,
        summary: actionSummary,
        preview: session.infoPreview ?? "",
      }),
    );
  } else {
    await sendInfoMessages(client, state);
  }
}

/**
 * Handles the Ravenkeeper's player-pick DM after they died at night.
 * Computes the role result (false info if poisoned), sends it back, then
 * proceeds to the storyteller info phase or sendInfoMessages.
 */
async function processRavenkeeperPickDm(
  message: Message,
  client: Client,
  state: GameState,
  rkPlayer: Player,
): Promise<boolean> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession!;
  const lang = getLang(rkPlayer.userId, state.guildId);

  const target = resolvePlayerName(message.content.trim(), state.players);
  if (!target) {
    const invalidReply = t(lang, "nightRavenkeeperPickInvalidPlayer", {
      name: message.content.trim(),
    });
    await message.reply(invalidReply);
    logBotMessage(state.channelId, rkPlayer.userId, invalidReply);
    return true;
  }

  const rkPs = getPlayerState(runtime, rkPlayer.userId);
  const targetPs = getPlayerState(runtime, target.userId);
  const poisoned = rkPs?.tags.has("poisoned") ?? false;

  let shownRoleId: string;
  if (poisoned) {
    // Give a random role from the script that is NOT the target's true role.
    const trueId = targetPs?.role.id ?? "";
    const candidates = getScript().roles.filter((r) => r.id !== trueId);
    shownRoleId = (pick(candidates, 1)[0] ?? getScript().roles[0]).id;
  } else {
    shownRoleId = targetPs!.role.id;
  }

  const result = t(lang, "nightRavenkeeperPickResult", {
    player: target.displayName,
    role: getRoleName(lang, shownRoleId),
  });
  await message.reply(result);
  logBotMessage(state.channelId, rkPlayer.userId, result);

  // Record in the session so the storyteller sees it in the info preview.
  session.infoMessages.set(rkPlayer.userId, result);
  session.infoOutcomeMeta.set(rkPlayer.userId, {
    kind: poisoned ? "randomized" : "fixed",
    reasonKey: poisoned ? "nightReasonFalseInfo" : "nightReasonRavenkeeperPick",
  });

  // Notify storyteller in manual mode.
  if (state.mode === "manual" && state.storytellerId) {
    try {
      const stUser = await client.users.fetch(state.storytellerId);
      const stLang = getLang(state.storytellerId, state.guildId);
      await stUser.send(
        t(stLang, "nightRavenkeeperPickStorytellerNotify", {
          rk: rkPlayer.displayName,
          target: target.displayName,
          role: getRoleName(stLang, shownRoleId),
        }),
      );
    } catch {
      // Ignore DM failure
    }
  }

  session.pendingRavenkeeperPick = null;
  await proceedAfterResolution(client, state, session);
  return true;
}

export async function handleNightStorytellerDm(
  message: Message,
  _client: Client,
  state: GameState,
  storyteller: User,
): Promise<boolean> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return false;

  const stLang = getLang(storyteller.id, state.guildId);
  const cmd = message.content.trim().toUpperCase();

  if (session.status === "awaiting_storyteller_action") {
    if (cmd !== "SEND") {
      await message.reply(t(stLang, "nightActionSendPrompt"));
      return true;
    }

    session.status = "awaiting_players";
    updateGame(state);

    for (const p of getAlivePlayers(state)) {
      const action = session.actionMessages.get(p.userId);
      if (!action) continue;
      await sendPlayerDm(_client, p, state, action);
    }

    await message.reply(t(stLang, "nightActionDispatched"));
    return true;
  }

  if (session.status === "awaiting_storyteller_info") {
    const lines = message.content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let shouldSend = false;

    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper === "SEND") {
        shouldSend = true;
        continue;
      }

      if (upper.startsWith("SET ")) {
        const parts = line.split(/\s+/);
        if (parts.length < 4) {
          await message.reply(t(stLang, "nightSetInvalidFormat"));
          return true;
        }

        const name = parts[1];
        const field = parts[2].toLowerCase();
        const value = parts.slice(3).join(" ").trim();
        if (!value) {
          await message.reply(t(stLang, "nightSetEmptyValue"));
          return true;
        }

        const target = resolvePlayerName(name, state.players);
        if (!target) {
          await message.reply(t(stLang, "nightSetUnknownPlayer", { name }));
          return true;
        }

        const draft = session.infoOutcomeDrafts.get(target.userId);
        if (!draft) {
          await message.reply(
            t(stLang, "nightSetNoTemplate", { player: target.displayName }),
          );
          return true;
        }

        const err = applyDraftFieldSet(state, draft, field, value, stLang);
        if (err) {
          await message.reply(t(stLang, "nightSetFailed", { error: err }));
          return true;
        }

        const consistencyErr = validateAndNormalizeDraft(state, draft, stLang);
        if (consistencyErr) {
          await message.reply(
            t(stLang, "nightSetRejected", { error: consistencyErr }),
          );
          return true;
        }

        session.infoOutcomeDrafts.set(target.userId, draft);
        const targetLang = getLang(target.userId, state.guildId);
        session.infoMessages.set(
          target.userId,
          renderOutcomeDraft(state, targetLang, draft),
        );
        const prevMeta = session.infoOutcomeMeta.get(target.userId);
        session.infoOutcomeMeta.set(target.userId, {
          kind: prevMeta?.kind ?? "fixed",
          reasonKey: "nightReasonStorytellerSet",
          reasonParams: { field },
        });
        continue;
      }

      if (upper.startsWith("OVERRIDE ")) {
        const body = line.slice("OVERRIDE ".length);
        const colon = body.indexOf(":");
        if (colon <= 0) {
          await message.reply(t(stLang, "nightOverrideInvalidFormat"));
          return true;
        }

        const name = body.slice(0, colon).trim();
        const content = body.slice(colon + 1).trim();
        if (!content) {
          await message.reply(t(stLang, "nightOverrideEmptyMessage"));
          return true;
        }

        const target = resolvePlayerName(name, state.players);
        if (!target) {
          await message.reply(
            t(stLang, "nightOverrideUnknownPlayer", { name }),
          );
          return true;
        }

        const targetDraft = session.infoOutcomeDrafts.get(target.userId);
        const targetCanArbitrary = targetDraft?.allowArbitraryOverride ?? false;
        if (!targetCanArbitrary) {
          await message.reply(
            t(stLang, "nightOverrideRejected", {
              player: target.displayName,
            }),
          );
          return true;
        }

        session.infoMessages.set(target.userId, content);
        session.infoOutcomeDrafts.delete(target.userId);
        session.infoOutcomeMeta.set(target.userId, {
          kind: "fixed",
          reasonKey: "nightReasonStorytellerOverride",
        });
        continue;
      }

      await message.reply(t(stLang, "nightUnrecognizedInput"));
      return true;
    }

    if (!shouldSend) {
      session.infoPreview = buildInfoPreview(state, stLang);
      updateGame(state);
      await message.reply(
        t(stLang, "nightEditsApplied", {
          preview: session.infoPreview ?? "",
        }),
      );
      return true;
    }

    await message.reply(t(stLang, "nightInfoSending"));
    await sendInfoMessages(_client, state);
    return true;
  }

  return false;
}

export function getNightPendingPlayerNames(state: GameState): string[] {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session || session.status !== "awaiting_players") return [];
  return session.pendingPlayerIds.map((id) => playerName(state, id));
}
