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

function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function pick<T>(arr: T[], n: number): T[] {
  if (n <= 0) return [];
  return shuffle(arr).slice(0, n);
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
    };
  }
  return state.runtime;
}

export function getPlayerState(
  runtime: RuntimeState,
  userId: string,
): PlayerRuntimeState | undefined {
  return runtime.playerStates.find((ps) => ps.player.userId === userId);
}

export function getRole(state: GameState, playerId: string): Role {
  return getPlayerState(state.runtime!, playerId)!.role;
}

function makeAckToken(): string {
  const syllables = [
    "ta",
    "ko",
    "mi",
    "ra",
    "shi",
    "lu",
    "zen",
    "fi",
    "nar",
    "bo",
  ];
  return `${pick(syllables, 2).join("")}${Math.floor(Math.random() * 90 + 10)}`;
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

function isEvil(role: Role): boolean {
  return role.category === "Minion" || role.category === "Demon";
}

function buildNightPrompt(
  state: GameState,
  player: Player,
): { prompt: NightPrompt; message: string } {
  const runtime = ensureRuntime(state);
  const lang = getLang(player.userId);
  const nightNumber = runtime.nightNumber;
  const effectiveRole = getPlayerState(runtime, player.userId)!.effectiveRole;

  const isFirstNight = nightNumber === 1;

  const infoRolesFirstNight = new Set([
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
    "empath",
    "spy",
  ]);
  const infoRolesOtherNights = new Set([
    "empath",
    "fortune_teller",
    "undertaker",
    "spy",
  ]);

  const actionRolesFirstNight = new Set([
    "poisoner",
    "butler",
    "fortune_teller",
  ]);
  const actionRolesOtherNights = new Set([
    "poisoner",
    "butler",
    "monk",
    "imp",
    "fortune_teller",
  ]);

  if (
    (isFirstNight ? actionRolesFirstNight : actionRolesOtherNights).has(
      effectiveRole.id,
    )
  ) {
    if (effectiveRole.id === "fortune_teller") {
      const msg = t(lang, "nightFortuneTellerPrompt");
      return {
        prompt: {
          playerId: player.userId,
          effectiveRoleId: effectiveRole.id,
          expected: "double_player",
          minChoices: 2,
          maxChoices: 2,
          allowSelf: true,
        },
        message: msg,
      };
    }

    if (effectiveRole.id === "butler") {
      const msg = t(lang, "nightButlerPrompt");
      return {
        prompt: {
          playerId: player.userId,
          effectiveRoleId: effectiveRole.id,
          expected: "single_player",
          minChoices: 1,
          maxChoices: 1,
          allowSelf: false,
        },
        message: msg,
      };
    }

    if (effectiveRole.id === "monk") {
      const msg = t(lang, "nightMonkPrompt");
      return {
        prompt: {
          playerId: player.userId,
          effectiveRoleId: effectiveRole.id,
          expected: "single_player",
          minChoices: 1,
          maxChoices: 1,
          allowSelf: false,
        },
        message: msg,
      };
    }

    if (effectiveRole.id === "imp") {
      const msg = t(lang, "nightImpPrompt");
      return {
        prompt: {
          playerId: player.userId,
          effectiveRoleId: effectiveRole.id,
          expected: "single_player",
          minChoices: 1,
          maxChoices: 1,
          allowSelf: true,
        },
        message: msg,
      };
    }

    if (effectiveRole.id === "poisoner") {
      const msg = t(lang, "nightPoisonerPrompt");
      return {
        prompt: {
          playerId: player.userId,
          effectiveRoleId: effectiveRole.id,
          expected: "single_player",
          minChoices: 1,
          maxChoices: 1,
          allowSelf: true,
        },
        message: msg,
      };
    }
  }

  if (
    (isFirstNight ? infoRolesFirstNight : infoRolesOtherNights).has(
      effectiveRole.id,
    )
  ) {
    const token = makeAckToken();
    const msg = t(lang, "nightAckPrompt", { token });
    return {
      prompt: {
        playerId: player.userId,
        effectiveRoleId: effectiveRole.id,
        expected: "ack",
        ackToken: token,
      },
      message: msg,
    };
  }

  return {
    prompt: {
      playerId: player.userId,
      effectiveRoleId: effectiveRole.id,
      expected: "free_text",
      minChoices: 1,
      maxChoices: 1,
      allowSelf: true,
    },
    message: t(lang, "nightJokePrompt", { joke: "..." }),
  };
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

  for (const ps of runtime.playerStates) {
    ps.tags.delete("protected");
    ps.tags.delete("poisoned");
  }

  const alivePlayers = getAlivePlayers(state);
  const prompts = new Map<string, NightPrompt>();
  const actionMessages = new Map<string, string>();
  const responses = new Map<string, string[]>();
  const infoMessages = new Map<string, string>();
  const infoOutcomeMeta = new Map<string, NightOutcomeMeta>();
  const infoOutcomeDrafts = new Map<string, NightOutcomeDraft>();

  const promptPreviewLines: string[] = [];

  // First pass: build all prompts synchronously, identify which players need jokes.
  const promptResults = alivePlayers.map((p) => {
    const { prompt, message } = buildNightPrompt(state, p);
    prompts.set(p.userId, prompt);
    promptPreviewLines.push(`- ${p.displayName}: ${prompt.effectiveRoleId}`);
    return { player: p, prompt, message };
  });

  // Fetch all required jokes in parallel before sending any messages.
  const jokePlayerIds = promptResults
    .filter((r) => r.prompt.expected === "free_text")
    .map((r) => r.player.userId);
  const fetchedJokes = await Promise.all(jokePlayerIds.map(() => getDadJoke()));
  const jokeByPlayerId = new Map(
    jokePlayerIds.map((id, i) => [id, fetchedJokes[i]]),
  );

  // Second pass: assemble actionMessages with pre-fetched jokes.
  for (const { player, prompt, message } of promptResults) {
    if (prompt.expected === "free_text") {
      const lang = getLang(player.userId);
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
  };

  runtime.nightSession = session;

  if (state.mode === "manual" && state.storytellerId) {
    const storyteller = await client.users.fetch(state.storytellerId);
    const lang = getLang(storyteller.id);
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
    const channelLang = getLang(state.players[0]?.userId ?? "");
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
): { ok: boolean; values?: string[]; error?: string } {
  const lang = getLang(fromPlayer.userId);

  if (prompt.expected === "ack") {
    if (content.trim() !== prompt.ackToken) {
      return {
        ok: false,
        error: t(lang, "nightExpectedToken", { token: prompt.ackToken ?? "" }),
      };
    }
    return { ok: true, values: [] };
  }

  if (prompt.expected === "free_text") {
    if (!content.trim())
      return { ok: false, error: t(lang, "nightPleaseSendReply") };
    return { ok: true, values: [content.trim()] };
  }

  const rawNames = parsePlayerInput(content);
  const minChoices = prompt.minChoices ?? 1;
  const maxChoices = prompt.maxChoices ?? minChoices;

  if (rawNames.length < minChoices || rawNames.length > maxChoices) {
    return {
      ok: false,
      error: t(lang, "nightExpectedPlayerNames", {
        count:
          minChoices === maxChoices
            ? minChoices
            : `${minChoices}-${maxChoices}`,
      }),
    };
  }

  const resolvedIds: string[] = [];
  for (const rawName of rawNames) {
    const p = resolvePlayerName(rawName, state.players);
    if (!p)
      return {
        ok: false,
        error: t(lang, "nightUnknownPlayerGeneric", { name: rawName }),
      };
    if (prompt.allowSelf === false && p.userId === fromPlayer.userId) {
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

  return { ok: true, values: resolvedIds };
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

  const p1 = String(draft.fields.p1);
  const p2 = String(draft.fields.p2);
  if (p1 === p2) {
    return t(lang, "nightDraftDifferentPlayers");
  }

  const pairCategory = String(draft.constraints?.pairCategory ?? "");
  if (!pairCategory) return null;

  const r1 = getRole(state, p1);
  const r2 = getRole(state, p2);
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

    if (prompt.expected === "ack") {
      detail = t(storytellerLang, "nightReadinessAck");
    } else if (prompt.expected === "free_text") {
      const reply = values[0] ?? t(storytellerLang, "nightNoText");
      detail = t(storytellerLang, "nightJokeReply", { reply });
    } else {
      const names = values.map((uid) => playerName(state, uid));
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

function computeChefCount(runtime: RuntimeState): number {
  const n = runtime.playerStates.length;
  if (n <= 1) return 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const psA = runtime.playerStates[i];
    const psB = runtime.playerStates[(i + 1) % n];
    if (isEvil(psA.role) && isEvil(psB.role)) count += 1;
  }
  return count;
}

function findAliveNeighborInDirection(
  runtime: RuntimeState,
  startIndex: number,
  dir: -1 | 1,
): Player | undefined {
  const n = runtime.playerStates.length;
  for (let step = 1; step < n; step++) {
    const idx = (startIndex + dir * step + n) % n;
    const ps = runtime.playerStates[idx];
    if (ps.alive) return ps.player;
  }
  return undefined;
}

function computeEmpathCount(runtime: RuntimeState, empathId: string): number {
  const empathPs = getPlayerState(runtime, empathId);
  if (!empathPs) return 0;

  const left = findAliveNeighborInDirection(runtime, empathPs.player.seatIndex, -1);
  const right = findAliveNeighborInDirection(runtime, empathPs.player.seatIndex, 1);
  const neighborIds = [left?.userId, right?.userId].filter(
    (x): x is string => !!x,
  );

  let count = 0;
  for (const uid of neighborIds) {
    const neighborPs = getPlayerState(runtime, uid);
    if (neighborPs && isEvil(neighborPs.role)) count += 1;
  }
  return count;
}

function randomBoolean(): boolean {
  return Math.random() < 0.5;
}

function shouldGetRandomInfo(ps: PlayerRuntimeState): boolean {
  return ps.role.id === "drunk" || ps.tags.has("poisoned");
}

function buildSpyGrimoire(state: GameState, lang: Lang): string {
  const runtime = ensureRuntime(state);
  const lines = runtime.playerStates.map((ps) => {
    return `${ps.player.displayName} — ${roleNameFor(lang, ps.role)} | ${ps.alive ? t(lang, "nightAlive") : t(lang, "nightDead")} | ${ps.tags.has("poisoned") ? t(lang, "nightPoisoned") : t(lang, "nightSober")}`;
  });
  return lines.join("\n");
}

function buildFalseSpyGrimoire(state: GameState, lang: Lang): string {
  const runtime = ensureRuntime(state);
  // Shuffle role assignments across players so every entry is plausibly wrong.
  const roles = shuffle(runtime.playerStates.map((ps) => ps.role));
  const lines = runtime.playerStates.map((ps, i) => {
    return `${ps.player.displayName} — ${roleNameFor(lang, roles[i])} | ${ps.alive ? t(lang, "nightAlive") : t(lang, "nightDead")} | ${ps.tags.has("poisoned") ? t(lang, "nightPoisoned") : t(lang, "nightSober")}`;
  });
  return lines.join("\n");
}

function resolveNightOutcomes(state: GameState): void {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return;

  for (const p of state.players) {
    const lang = getLang(p.userId);
    session.infoMessages.set(p.userId, t(lang, "nightInteractionRecorded"));
    session.infoOutcomeMeta.set(p.userId, {
      kind: "fixed",
      reasonKey: "nightReasonDeterministic",
    });
    session.infoOutcomeDrafts.delete(p.userId);
  }

  // Process action intents first.
  for (const [playerId, values] of session.responses.entries()) {
    const actorPs = getPlayerState(runtime, playerId);
    if (!actorPs?.alive) continue;
    const effectiveRole = actorPs.effectiveRole;

    if (
      actorPs.role.id === "drunk" &&
      (effectiveRole.id === "poisoner" ||
        effectiveRole.id === "butler" ||
        effectiveRole.id === "monk" ||
        effectiveRole.id === "imp")
    ) {
      continue;
    }

    if (effectiveRole.id === "poisoner" && values[0]) {
      const targetPs = getPlayerState(runtime, values[0]);
      if (targetPs) targetPs.tags.add("poisoned");
    }

    if (effectiveRole.id === "butler" && values[0]) {
      runtime.playerStates.forEach((ps) => ps.tags.delete("butler_master"));
      getPlayerState(runtime, values[0])?.tags.add("butler_master");
    }

    if (effectiveRole.id === "monk" && values[0]) {
      const targetPs = getPlayerState(runtime, values[0]);
      if (targetPs) targetPs.tags.add("protected");
    }
  }

  // Resolve Imp kill after Monk protection.
  for (const [playerId, values] of session.responses.entries()) {
    const actorPs = getPlayerState(runtime, playerId);
    if (!actorPs) continue;
    if (actorPs.effectiveRole.id !== "imp") continue;
    if (actorPs.role.id === "drunk") continue;

    const targetId = values[0];
    if (!targetId) continue;

    const targetPs = getPlayerState(runtime, targetId);
    if (!targetPs || !targetPs.alive) continue;

    if (targetPs.role.id === "soldier") continue;
    if (targetPs.tags.has("protected")) continue;

    if (targetPs.role.id === "mayor" && randomBoolean()) {
      const candidates = getAlivePlayers(state).filter(
        (p) => p.userId !== targetId,
      );
      const redirected = pick(candidates, 1)[0];
      if (redirected) {
        const redirectedPs = getPlayerState(runtime, redirected.userId);
        if (redirectedPs) {
          redirectedPs.alive = false;
          runtime.nightKillIds.push(redirected.userId);
        }
      }
      continue;
    }

    targetPs.alive = false;
    runtime.nightKillIds.push(targetId);
  }

  // Compute third-message content.
  for (const ps of runtime.playerStates) {
    const { player } = ps;
    const lang = getLang(player.userId);
    const effectiveRole = ps.effectiveRole;
    const prompt = session.prompts.get(player.userId);
    if (!prompt) continue;

    if (prompt.expected === "free_text") {
      session.infoMessages.set(player.userId, t(lang, "nightJudgeJoke"));
      session.infoOutcomeDrafts.delete(player.userId);
      session.infoOutcomeMeta.set(player.userId, {
        kind: "fixed",
        reasonKey: "nightReasonJokeInteraction",
      });
      continue;
    }

    if (effectiveRole.id === "washerwoman") {
      const randomInfo = shouldGetRandomInfo(ps);
      const townsfolk = state.players.filter(
        (p) => getRole(state, p.userId).category === "Townsfolk",
      );
      const otherPlayers = randomInfo
        ? state.players.filter((p) => p.userId !== player.userId)
        : state.players;
      const tfTarget = randomInfo
        ? pick(otherPlayers, 1)[0]
        : pick(townsfolk, 1)[0];

      const role = randomInfo
        ? (pick(
            getScript().roles.filter((r) => r.category === "Townsfolk"),
            1,
          )[0] ?? ps.effectiveRole)
        : tfTarget
          ? getRole(state, tfTarget.userId)
          : ps.effectiveRole;

      const decoy = pick(
        otherPlayers.filter((p) => p.userId !== tfTarget?.userId),
        1,
      )[0];
      const two = shuffle([tfTarget, decoy].filter((x): x is Player => !!x));
      const selectedFields = {
        p1: two[0]?.userId ?? player.userId,
        p2: two[1]?.userId ?? player.userId,
        role: role.id,
      };
      const draft: NightOutcomeDraft = {
        templateId: "pair_role_info",
        fields: selectedFields,
        fieldTypes: randomInfo
          ? {
              p1: "player",
              p2: "player",
              role: "role",
            }
          : {
              p1: "player",
              p2: "player",
            },
        constraints: {
          pairCategory: "Townsfolk",
        },
        allowArbitraryOverride: randomInfo,
      };
      session.infoOutcomeDrafts.set(player.userId, draft);
      session.infoMessages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.infoOutcomeMeta.set(player.userId, {
        kind: "randomized",
        reasonKey: randomInfo ? "nightReasonFalseInfo" : "nightReasonDecoyPair",
      });
      continue;
    }

    if (effectiveRole.id === "librarian") {
      const randomInfo = shouldGetRandomInfo(ps);
      const outsiders = state.players.filter(
        (p) => getRole(state, p.userId).category === "Outsider",
      );
      if (!randomInfo && outsiders.length === 0) {
        session.infoMessages.set(
          player.userId,
          t(lang, "nightLibrarianNoOutsiders"),
        );
        session.infoOutcomeDrafts.delete(player.userId);
        session.infoOutcomeMeta.set(player.userId, {
          kind: "fixed",
          reasonKey: "nightReasonNoOutsiders",
        });
        continue;
      }

      const otherPlayers = randomInfo
        ? state.players.filter((p) => p.userId !== player.userId)
        : state.players;
      const osTarget = randomInfo
        ? pick(otherPlayers, 1)[0]
        : pick(outsiders, 1)[0];
      const osRole = randomInfo
        ? (pick(
            getScript().roles.filter((r) => r.category === "Outsider"),
            1,
          )[0] ?? ps.effectiveRole)
        : osTarget
          ? getRole(state, osTarget.userId)
          : ps.effectiveRole;
      const decoy = pick(
        otherPlayers.filter((p) => p.userId !== osTarget?.userId),
        1,
      )[0];
      const two = shuffle([osTarget, decoy].filter((x): x is Player => !!x));
      const selectedFields = {
        p1: two[0]?.userId ?? player.userId,
        p2: two[1]?.userId ?? player.userId,
        role: osRole.id,
      };
      const draft: NightOutcomeDraft = {
        templateId: "pair_role_info",
        fields: selectedFields,
        fieldTypes: randomInfo
          ? {
              p1: "player",
              p2: "player",
              role: "role",
            }
          : {
              p1: "player",
              p2: "player",
            },
        constraints: {
          pairCategory: "Outsider",
        },
        allowArbitraryOverride: randomInfo,
      };
      session.infoOutcomeDrafts.set(player.userId, draft);
      session.infoMessages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.infoOutcomeMeta.set(player.userId, {
        kind: "randomized",
        reasonKey: randomInfo ? "nightReasonFalseInfo" : "nightReasonDecoyPair",
      });
      continue;
    }

    if (effectiveRole.id === "investigator") {
      const randomInfo = shouldGetRandomInfo(ps);
      const minions = state.players.filter(
        (p) => getRole(state, p.userId).category === "Minion",
      );
      const otherPlayers = randomInfo
        ? state.players.filter((p) => p.userId !== player.userId)
        : state.players;
      const minionTarget = randomInfo
        ? pick(otherPlayers, 1)[0]
        : pick(minions, 1)[0];
      const minionRole = randomInfo
        ? (pick(
            getScript().roles.filter((r) => r.category === "Minion"),
            1,
          )[0] ?? ps.effectiveRole)
        : minionTarget
          ? getRole(state, minionTarget.userId)
          : ps.effectiveRole;
      const decoy = pick(
        otherPlayers.filter((p) => p.userId !== minionTarget?.userId),
        1,
      )[0];
      const two = shuffle(
        [minionTarget, decoy].filter((x): x is Player => !!x),
      );
      const selectedFields = {
        p1: two[0]?.userId ?? player.userId,
        p2: two[1]?.userId ?? player.userId,
        role: minionRole.id,
      };
      const draft: NightOutcomeDraft = {
        templateId: "pair_role_info",
        fields: selectedFields,
        fieldTypes: randomInfo
          ? {
              p1: "player",
              p2: "player",
              role: "role",
            }
          : {
              p1: "player",
              p2: "player",
            },
        constraints: {
          pairCategory: "Minion",
        },
        allowArbitraryOverride: randomInfo,
      };
      session.infoOutcomeDrafts.set(player.userId, draft);
      session.infoMessages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.infoOutcomeMeta.set(player.userId, {
        kind: "randomized",
        reasonKey: randomInfo ? "nightReasonFalseInfo" : "nightReasonDecoyPair",
      });
      continue;
    }

    if (effectiveRole.id === "chef") {
      const randomInfo = shouldGetRandomInfo(ps);
      // Max possible Chef count in a circular seating of E evil players is E−1
      // (all evil consecutive), so the false range is {0, …, E−1}.
      const numEvil = runtime.playerStates.filter((p2) =>
        isEvil(p2.role),
      ).length;
      const fixedValue = computeChefCount(runtime);
      const randomizedValue = Math.floor(Math.random() * Math.max(numEvil, 1));
      const selectedValue = randomInfo ? randomizedValue : fixedValue;
      const draft: NightOutcomeDraft = {
        templateId: "chef_count",
        fields: { count: selectedValue },
        fieldTypes: randomInfo ? { count: "number" } : {},
        allowArbitraryOverride: randomInfo,
      };
      session.infoOutcomeDrafts.set(player.userId, draft);
      session.infoMessages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.infoOutcomeMeta.set(player.userId, {
        kind: randomInfo ? "randomized" : "fixed",
        reasonKey: randomInfo ? "nightReasonFalseInfo" : "nightReasonChefSeating",
      });
      continue;
    }

    if (effectiveRole.id === "empath") {
      const randomInfo = shouldGetRandomInfo(ps);
      const leftNeighbor = findAliveNeighborInDirection(
        runtime,
        player.seatIndex,
        -1,
      );
      const rightNeighbor = findAliveNeighborInDirection(
        runtime,
        player.seatIndex,
        1,
      );
      const fixedValue = computeEmpathCount(runtime, player.userId);
      const randomizedValue = Math.floor(Math.random() * 3);
      const selectedValue = randomInfo ? randomizedValue : fixedValue;
      const draft: NightOutcomeDraft = {
        templateId: "empath_count",
        fields: {
          left: leftNeighbor?.userId ?? player.userId,
          right: rightNeighbor?.userId ?? player.userId,
          count: selectedValue,
        },
        fieldTypes: randomInfo
          ? {
              left: "player",
              right: "player",
              count: "number",
            }
          : {},
        allowArbitraryOverride: randomInfo,
      };
      session.infoOutcomeDrafts.set(player.userId, draft);
      session.infoMessages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.infoOutcomeMeta.set(player.userId, {
        kind: randomInfo ? "randomized" : "fixed",
        reasonKey: randomInfo
          ? "nightReasonFalseInfo"
          : "nightReasonEmpathNeighbors",
      });
      continue;
    }

    if (effectiveRole.id === "fortune_teller") {
      const choices = session.responses.get(player.userId) ?? [];
      const randomInfo = shouldGetRandomInfo(ps);
      const hasDemon = choices.some(
        (uid) => getRole(state, uid)?.category === "Demon",
      );
      const hasHerring = choices.some(
        (uid) => getPlayerState(runtime, uid)?.tags.has("red_herring"),
      );
      const fixedYes = hasDemon || hasHerring;
      const randomizedYes = randomBoolean();
      const selectedYes = randomInfo ? randomizedYes : fixedYes;
      const draft: NightOutcomeDraft = {
        templateId: "fortune_result",
        fields: { yes: selectedYes },
        fieldTypes: randomInfo ? { yes: "boolean" } : {},
        allowArbitraryOverride: randomInfo,
      };
      session.infoOutcomeDrafts.set(player.userId, draft);
      session.infoMessages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.infoOutcomeMeta.set(player.userId, {
        kind: randomInfo ? "randomized" : "fixed",
        reasonKey: randomInfo
          ? "nightReasonFalseInfo"
          : "nightReasonFortuneCheck",
      });
      continue;
    }

    if (effectiveRole.id === "undertaker") {
      if (!runtime.lastExecutedPlayerId) {
        session.infoMessages.set(player.userId, t(lang, "nightNoExecution"));
        session.infoOutcomeDrafts.delete(player.userId);
        session.infoOutcomeMeta.set(player.userId, {
          kind: "fixed",
          reasonKey: "nightReasonNoExecution",
        });
      } else {
        const executedRole = getRole(state, runtime.lastExecutedPlayerId);
        const draft: NightOutcomeDraft = {
          templateId: "undertaker_role",
          fields: { role: executedRole.id },
          fieldTypes: {},
          allowArbitraryOverride: false,
        };
        session.infoOutcomeDrafts.set(player.userId, draft);
        session.infoMessages.set(
          player.userId,
          renderOutcomeDraft(state, lang, draft),
        );
        session.infoOutcomeMeta.set(player.userId, {
          kind: "fixed",
          reasonKey: "nightReasonExecutionRecord",
        });
      }
      continue;
    }

    if (effectiveRole.id === "spy") {
      const randomInfo = shouldGetRandomInfo(ps);
      const grimoire = randomInfo
        ? buildFalseSpyGrimoire(state, lang)
        : buildSpyGrimoire(state, lang);
      session.infoMessages.set(
        player.userId,
        t(lang, "nightGrimoire", { grimoire }),
      );
      session.infoOutcomeDrafts.delete(player.userId);
      session.infoOutcomeMeta.set(player.userId, {
        kind: randomInfo ? "randomized" : "fixed",
        reasonKey: randomInfo
          ? "nightReasonFalseGrimoire"
          : "nightReasonGrimoireReveal",
      });
      continue;
    }

    if (
      prompt.expected === "single_player" ||
      prompt.expected === "double_player"
    ) {
      session.infoMessages.set(player.userId, t(lang, "nightChoiceRecorded"));
      session.infoOutcomeDrafts.delete(player.userId);
      session.infoOutcomeMeta.set(player.userId, {
        kind: "fixed",
        reasonKey: "nightReasonActionAck",
      });
    }
  }

  for (const deadPs of runtime.playerStates.filter((ps) => !ps.alive)) {
    if (deadPs.role.id !== "ravenkeeper") continue;
    // Placeholder for Ravenkeeper immediate wake on night death.
    const lang = getLang(deadPs.player.userId);
    session.infoMessages.set(
      deadPs.player.userId,
      t(lang, "nightRavenkeeperPlaceholder"),
    );
    session.infoOutcomeMeta.set(deadPs.player.userId, {
      kind: "fixed",
      reasonKey: "nightReasonRavenkeeper",
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
  if (!session || session.status !== "awaiting_players") return false;

  const isParticipant = state.players.some(
    (p) => p.userId === message.author.id,
  );
  if (!isParticipant) return false;

  const player = state.players.find((p) => p.userId === message.author.id)!;
  if (!getPlayerState(runtime, player.userId)?.alive) return true;

  const prompt = session.prompts.get(player.userId);
  if (!prompt) return false;

  const validation = validatePromptResponse(
    message.content.trim(),
    prompt,
    state,
    player,
  );
  const lang = getLang(player.userId);
  if (!validation.ok) {
    await message.reply(
      t(lang, "nightInvalidInput", { error: validation.error ?? "" }),
    );
    return true;
  }
  session.responses.set(player.userId, validation.values ?? []);
  session.pendingPlayerIds = session.pendingPlayerIds.filter(
    (id) => id !== player.userId,
  );
  updateGame(state);

  await message.reply(t(lang, "nightResponseRecorded"));

  if (session.pendingPlayerIds.length === 0) {
    resolveNightOutcomes(state);

    if (state.mode === "manual" && state.storytellerId) {
      session.status = "awaiting_storyteller_info";
      const storyteller = await client.users.fetch(state.storytellerId);
      const stLang = getLang(storyteller.id);
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

  const stLang = getLang(storyteller.id);
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
        const targetLang = getLang(target.userId);
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
