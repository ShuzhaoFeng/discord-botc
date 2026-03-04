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
  Role,
  RuntimeState,
} from "./types";
import { getLang, getRoleName, t } from "../i18n";
import { findRole, ROLE_BY_ID } from "./roles";
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

function effectiveRoleForPlayer(state: GameState, playerId: string): Role {
  const draft = state.draft!;
  const role = draft.assignments.get(playerId)!;
  if (role.id === "drunk" && draft.drunkFakeRole) return draft.drunkFakeRole;
  return role;
}

export function ensureRuntime(state: GameState): RuntimeState {
  if (!state.runtime) {
    const playerStates = new Map<string, PlayerRuntimeState>();
    for (const p of state.players) {
      playerStates.set(p.userId, {
        alive: true,
        poisoned: false,
        butlerMasterId: null,
        protectedTonight: false,
        ghostVoteUsed: false,
      });
    }
    state.runtime = {
      nightNumber: 0,
      playerStates,
      nightSession: null,
      daySession: null,
      lastExecutedPlayerId: null,
      nightKillIds: [],
      slayerHasUsed: false,
    };
  }
  return state.runtime;
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
  return state.players.filter((p) => runtime.playerStates.get(p.userId)?.alive);
}

function getRole(state: GameState, playerId: string): Role {
  return state.draft!.assignments.get(playerId)!;
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
  const trueRole = getRole(state, player.userId);
  const effectiveRole = effectiveRoleForPlayer(state, player.userId);

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

  for (const ps of runtime.playerStates.values()) {
    ps.protectedTonight = false;
    ps.poisoned = false;
  }

  const alivePlayers = getAlivePlayers(state);
  const prompts = new Map<string, NightPrompt>();
  const step1Messages = new Map<string, string>();
  const responses = new Map<string, string[]>();
  const step3Messages = new Map<string, string>();
  const step3OutcomeMeta = new Map<string, NightOutcomeMeta>();
  const step3OutcomeDrafts = new Map<string, NightOutcomeDraft>();

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

  // Second pass: assemble step1Messages with pre-fetched jokes.
  for (const { player, prompt, message } of promptResults) {
    if (prompt.expected === "free_text") {
      const lang = getLang(player.userId);
      const joke = jokeByPlayerId.get(player.userId)!;
      step1Messages.set(player.userId, t(lang, "nightJokePrompt", { joke }));
    } else {
      step1Messages.set(player.userId, message);
    }
  }

  const session: NightSession = {
    nightNumber: runtime.nightNumber,
    status:
      state.mode === "manual"
        ? "awaiting_storyteller_step1"
        : "awaiting_players",
    prompts,
    step1Messages,
    responses,
    pendingPlayerIds: alivePlayers.map((p) => p.userId),
    step1Preview: promptPreviewLines.join("\n"),
    step3Messages,
    step3OutcomeMeta,
    step3OutcomeDrafts,
  };

  runtime.nightSession = session;

  if (state.mode === "manual" && state.storytellerId) {
    const storyteller = await client.users.fetch(state.storytellerId);
    const lang = getLang(storyteller.id);
    await storyteller.send(
      t(lang, "nightStep1Preview", {
        n: session.nightNumber,
        preview: session.step1Preview ?? "",
      }),
    );
  }

  if (state.mode === "automated") {
    for (const p of alivePlayers) {
      const message = step1Messages.get(p.userId);
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
    const role = ROLE_BY_ID.get(String(draft.fields.role));
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
    const role = ROLE_BY_ID.get(roleId);
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
  if (!meta) return "";
  const reason = lang === "zh" ? meta.reasonZh : meta.reasonEn;
  if (!reason) return "";
  return t(lang, "nightOutcomeReason", { reason });
}

function buildStep3Preview(state: GameState, storytellerLang: Lang): string {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return "";

  const previewLines: string[] = [];
  for (const p of state.players) {
    const msg = session.step3Messages.get(p.userId);
    if (!msg) continue;
    const meta = session.step3OutcomeMeta.get(p.userId);
    const draft = session.step3OutcomeDrafts.get(p.userId);
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

function buildStep2Summary(state: GameState, storytellerLang: Lang): string {
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

function computeChefCount(state: GameState): number {
  const n = state.players.length;
  if (n <= 1) return 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = state.players[i];
    const b = state.players[(i + 1) % n];
    const roleA = getRole(state, a.userId);
    const roleB = getRole(state, b.userId);
    if (isEvil(roleA) && isEvil(roleB)) count += 1;
  }
  return count;
}

function findAliveNeighborInDirection(
  state: GameState,
  startIndex: number,
  dir: -1 | 1,
): Player | undefined {
  const runtime = ensureRuntime(state);
  const n = state.players.length;
  for (let step = 1; step < n; step++) {
    const idx = (startIndex + dir * step + n) % n;
    const candidate = state.players[idx];
    if (runtime.playerStates.get(candidate.userId)?.alive) return candidate;
  }
  return undefined;
}

function computeEmpathCount(state: GameState, empathId: string): number {
  const player = state.players.find((p) => p.userId === empathId);
  if (!player) return 0;

  const left = findAliveNeighborInDirection(state, player.seatIndex, -1);
  const right = findAliveNeighborInDirection(state, player.seatIndex, 1);
  const neighborIds = [left?.userId, right?.userId].filter(
    (x): x is string => !!x,
  );

  let count = 0;
  for (const uid of neighborIds) {
    const role = getRole(state, uid);
    if (isEvil(role)) count += 1;
  }
  return count;
}

function randomBoolean(): boolean {
  return Math.random() < 0.5;
}

function isDrunk(state: GameState, playerId: string): boolean {
  return getRole(state, playerId).id === "drunk";
}

function isPoisoned(state: GameState, playerId: string): boolean {
  const runtime = ensureRuntime(state);
  return runtime.playerStates.get(playerId)?.poisoned ?? false;
}

function shouldGetRandomInfo(state: GameState, playerId: string): boolean {
  return isDrunk(state, playerId) || isPoisoned(state, playerId);
}

function buildSpyGrimoire(state: GameState, lang: Lang): string {
  const runtime = ensureRuntime(state);
  const lines = state.players.map((p) => {
    const role = getRole(state, p.userId);
    const ps = runtime.playerStates.get(p.userId)!;
    return `${p.displayName} — ${roleNameFor(lang, role)} | ${ps.alive ? t(lang, "nightAlive") : t(lang, "nightDead")} | ${ps.poisoned ? t(lang, "nightPoisoned") : t(lang, "nightSober")}`;
  });
  return lines.join("\n");
}

function buildFalseSpyGrimoire(state: GameState, lang: Lang): string {
  const runtime = ensureRuntime(state);
  // Shuffle role assignments across players so every entry is plausibly wrong.
  const roles = shuffle(state.players.map((p) => getRole(state, p.userId)));
  const lines = state.players.map((p, i) => {
    const ps = runtime.playerStates.get(p.userId)!;
    return `${p.displayName} — ${roleNameFor(lang, roles[i])} | ${ps.alive ? t(lang, "nightAlive") : t(lang, "nightDead")} | ${ps.poisoned ? t(lang, "nightPoisoned") : t(lang, "nightSober")}`;
  });
  return lines.join("\n");
}

function resolveNightOutcomes(state: GameState): void {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return;

  for (const p of state.players) {
    const lang = getLang(p.userId);
    session.step3Messages.set(p.userId, t(lang, "nightInteractionRecorded"));
    session.step3OutcomeMeta.set(p.userId, {
      kind: "fixed",
      reasonEn: "deterministic role resolution",
      reasonZh: "确定性角色结算",
    });
    session.step3OutcomeDrafts.delete(p.userId);
  }

  // Process action intents first.
  for (const [playerId, values] of session.responses.entries()) {
    const effectiveRole = effectiveRoleForPlayer(state, playerId);
    const actorState = runtime.playerStates.get(playerId);
    if (!actorState?.alive) continue;

    if (
      isDrunk(state, playerId) &&
      (effectiveRole.id === "poisoner" ||
        effectiveRole.id === "butler" ||
        effectiveRole.id === "monk" ||
        effectiveRole.id === "imp")
    ) {
      continue;
    }

    if (effectiveRole.id === "poisoner" && values[0]) {
      const targetState = runtime.playerStates.get(values[0]);
      if (targetState) targetState.poisoned = true;
    }

    if (effectiveRole.id === "butler" && values[0]) {
      const actor = runtime.playerStates.get(playerId);
      if (actor) actor.butlerMasterId = values[0];
    }

    if (effectiveRole.id === "monk" && values[0]) {
      const targetState = runtime.playerStates.get(values[0]);
      if (targetState) targetState.protectedTonight = true;
    }
  }

  // Resolve Imp kill after Monk protection.
  for (const [playerId, values] of session.responses.entries()) {
    const effectiveRole = effectiveRoleForPlayer(state, playerId);
    if (effectiveRole.id !== "imp") continue;
    if (isDrunk(state, playerId)) continue;

    const targetId = values[0];
    if (!targetId) continue;

    const targetRole = getRole(state, targetId);
    const targetState = runtime.playerStates.get(targetId);
    if (!targetState || !targetState.alive) continue;

    if (targetRole.id === "soldier") continue;
    if (targetState.protectedTonight) continue;

    if (targetRole.id === "mayor" && randomBoolean()) {
      const candidates = getAlivePlayers(state).filter(
        (p) => p.userId !== targetId,
      );
      const redirected = pick(candidates, 1)[0];
      if (redirected) {
        const redirectedState = runtime.playerStates.get(redirected.userId);
        if (redirectedState) {
          redirectedState.alive = false;
          runtime.nightKillIds.push(redirected.userId);
        }
      }
      continue;
    }

    targetState.alive = false;
    runtime.nightKillIds.push(targetId);
  }

  // Compute third-message content.
  for (const player of state.players) {
    const lang = getLang(player.userId);
    const effectiveRole = effectiveRoleForPlayer(state, player.userId);
    const prompt = session.prompts.get(player.userId);
    if (!prompt) continue;

    if (prompt.expected === "free_text") {
      session.step3Messages.set(player.userId, t(lang, "nightJudgeJoke"));
      session.step3OutcomeDrafts.delete(player.userId);
      session.step3OutcomeMeta.set(player.userId, {
        kind: "fixed",
        reasonEn: "no night ability (joke interaction)",
        reasonZh: "该夜无能力（笑话互动）",
      });
      continue;
    }

    if (effectiveRole.id === "washerwoman") {
      const randomInfo = shouldGetRandomInfo(state, player.userId);
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
            [...ROLE_BY_ID.values()].filter((r) => r.category === "Townsfolk"),
            1,
          )[0] ?? effectiveRoleForPlayer(state, player.userId))
        : tfTarget
          ? getRole(state, tfTarget.userId)
          : effectiveRoleForPlayer(state, player.userId);

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
      session.step3OutcomeDrafts.set(player.userId, draft);
      session.step3Messages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.step3OutcomeMeta.set(player.userId, {
        kind: "randomized",
        reasonEn: randomInfo
          ? "poisoned/drunk false information"
          : "decoy pair randomized by storyteller model",
        reasonZh: randomInfo
          ? "中毒/酒鬼导致虚假信息"
          : "说书人模型随机选取干扰位",
      });
      continue;
    }

    if (effectiveRole.id === "librarian") {
      const randomInfo = shouldGetRandomInfo(state, player.userId);
      const outsiders = state.players.filter(
        (p) => getRole(state, p.userId).category === "Outsider",
      );
      if (!randomInfo && outsiders.length === 0) {
        session.step3Messages.set(
          player.userId,
          t(lang, "nightLibrarianNoOutsiders"),
        );
        session.step3OutcomeDrafts.delete(player.userId);
        session.step3OutcomeMeta.set(player.userId, {
          kind: "fixed",
          reasonEn: "no Outsiders in play",
          reasonZh: "本局无外来者",
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
            [...ROLE_BY_ID.values()].filter((r) => r.category === "Outsider"),
            1,
          )[0] ?? effectiveRoleForPlayer(state, player.userId))
        : osTarget
          ? getRole(state, osTarget.userId)
          : effectiveRoleForPlayer(state, player.userId);
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
      session.step3OutcomeDrafts.set(player.userId, draft);
      session.step3Messages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.step3OutcomeMeta.set(player.userId, {
        kind: "randomized",
        reasonEn: randomInfo
          ? "poisoned/drunk false information"
          : "decoy pair randomized by storyteller model",
        reasonZh: randomInfo
          ? "中毒/酒鬼导致虚假信息"
          : "说书人模型随机选取干扰位",
      });
      continue;
    }

    if (effectiveRole.id === "investigator") {
      const randomInfo = shouldGetRandomInfo(state, player.userId);
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
            [...ROLE_BY_ID.values()].filter((r) => r.category === "Minion"),
            1,
          )[0] ?? effectiveRoleForPlayer(state, player.userId))
        : minionTarget
          ? getRole(state, minionTarget.userId)
          : effectiveRoleForPlayer(state, player.userId);
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
      session.step3OutcomeDrafts.set(player.userId, draft);
      session.step3Messages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.step3OutcomeMeta.set(player.userId, {
        kind: "randomized",
        reasonEn: randomInfo
          ? "poisoned/drunk false information"
          : "decoy pair randomized by storyteller model",
        reasonZh: randomInfo
          ? "中毒/酒鬼导致虚假信息"
          : "说书人模型随机选取干扰位",
      });
      continue;
    }

    if (effectiveRole.id === "chef") {
      const randomInfo = shouldGetRandomInfo(state, player.userId);
      // Max possible Chef count in a circular seating of E evil players is E−1
      // (all evil consecutive), so the false range is {0, …, E−1}.
      const numEvil = state.players.filter((p) =>
        isEvil(getRole(state, p.userId)),
      ).length;
      const fixedValue = computeChefCount(state);
      const randomizedValue = Math.floor(Math.random() * Math.max(numEvil, 1));
      const selectedValue = randomInfo ? randomizedValue : fixedValue;
      const draft: NightOutcomeDraft = {
        templateId: "chef_count",
        fields: { count: selectedValue },
        fieldTypes: randomInfo ? { count: "number" } : {},
        allowArbitraryOverride: randomInfo,
      };
      session.step3OutcomeDrafts.set(player.userId, draft);
      session.step3Messages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.step3OutcomeMeta.set(player.userId, {
        kind: randomInfo ? "randomized" : "fixed",
        reasonEn: randomInfo
          ? "poisoned/drunk false information"
          : "computed from true seating",
        reasonZh: randomInfo ? "中毒/酒鬼导致虚假信息" : "按真实座次计算",
      });
      continue;
    }

    if (effectiveRole.id === "empath") {
      const randomInfo = shouldGetRandomInfo(state, player.userId);
      const leftNeighbor = findAliveNeighborInDirection(
        state,
        player.seatIndex,
        -1,
      );
      const rightNeighbor = findAliveNeighborInDirection(
        state,
        player.seatIndex,
        1,
      );
      const fixedValue = computeEmpathCount(state, player.userId);
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
      session.step3OutcomeDrafts.set(player.userId, draft);
      session.step3Messages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.step3OutcomeMeta.set(player.userId, {
        kind: randomInfo ? "randomized" : "fixed",
        reasonEn: randomInfo
          ? "poisoned/drunk false information"
          : "computed from alive neighbors",
        reasonZh: randomInfo ? "中毒/酒鬼导致虚假信息" : "按存活邻座计算",
      });
      continue;
    }

    if (effectiveRole.id === "fortune_teller") {
      const choices = session.responses.get(player.userId) ?? [];
      const randomInfo = shouldGetRandomInfo(state, player.userId);
      const hasDemon = choices.some(
        (uid) => getRole(state, uid)?.category === "Demon",
      );
      const hasHerring = choices.some((uid) => uid === state.draft?.redHerring);
      const fixedYes = hasDemon || hasHerring;
      const randomizedYes = randomBoolean();
      const selectedYes = randomInfo ? randomizedYes : fixedYes;
      const draft: NightOutcomeDraft = {
        templateId: "fortune_result",
        fields: { yes: selectedYes },
        fieldTypes: randomInfo ? { yes: "boolean" } : {},
        allowArbitraryOverride: randomInfo,
      };
      session.step3OutcomeDrafts.set(player.userId, draft);
      session.step3Messages.set(
        player.userId,
        renderOutcomeDraft(state, lang, draft),
      );
      session.step3OutcomeMeta.set(player.userId, {
        kind: randomInfo ? "randomized" : "fixed",
        reasonEn: randomInfo
          ? "poisoned/drunk false information"
          : "resolved from demon/red herring check",
        reasonZh: randomInfo
          ? "中毒/酒鬼导致虚假信息"
          : "按恶魔/红鲱鱼检定结算",
      });
      continue;
    }

    if (effectiveRole.id === "undertaker") {
      if (!runtime.lastExecutedPlayerId) {
        session.step3Messages.set(player.userId, t(lang, "nightNoExecution"));
        session.step3OutcomeDrafts.delete(player.userId);
        session.step3OutcomeMeta.set(player.userId, {
          kind: "fixed",
          reasonEn: "no execution recorded today",
          reasonZh: "今日无处决记录",
        });
      } else {
        const executedRole = getRole(state, runtime.lastExecutedPlayerId);
        const draft: NightOutcomeDraft = {
          templateId: "undertaker_role",
          fields: { role: executedRole.id },
          fieldTypes: {},
          allowArbitraryOverride: false,
        };
        session.step3OutcomeDrafts.set(player.userId, draft);
        session.step3Messages.set(
          player.userId,
          renderOutcomeDraft(state, lang, draft),
        );
        session.step3OutcomeMeta.set(player.userId, {
          kind: "fixed",
          reasonEn: "resolved from execution record",
          reasonZh: "按处决记录结算",
        });
      }
      continue;
    }

    if (effectiveRole.id === "spy") {
      const randomInfo = shouldGetRandomInfo(state, player.userId);
      const grimoire = randomInfo
        ? buildFalseSpyGrimoire(state, lang)
        : buildSpyGrimoire(state, lang);
      session.step3Messages.set(
        player.userId,
        t(lang, "nightGrimoire", { grimoire }),
      );
      session.step3OutcomeDrafts.delete(player.userId);
      session.step3OutcomeMeta.set(player.userId, {
        kind: randomInfo ? "randomized" : "fixed",
        reasonEn: randomInfo
          ? "poisoned/drunk false grimoire"
          : "direct grimoire reveal",
        reasonZh: randomInfo ? "中毒/酒鬼导致虚假手册" : "直接展示手册信息",
      });
      continue;
    }

    if (
      prompt.expected === "single_player" ||
      prompt.expected === "double_player"
    ) {
      session.step3Messages.set(player.userId, t(lang, "nightChoiceRecorded"));
      session.step3OutcomeDrafts.delete(player.userId);
      session.step3OutcomeMeta.set(player.userId, {
        kind: "fixed",
        reasonEn: "action acknowledgment",
        reasonZh: "行动回执",
      });
    }
  }

  const deadTonight = state.players.filter(
    (p) => !runtime.playerStates.get(p.userId)?.alive,
  );
  for (const dead of deadTonight) {
    const role = getRole(state, dead.userId);
    if (role.id !== "ravenkeeper") continue;
    // Placeholder for Ravenkeeper immediate wake on night death.
    const lang = getLang(dead.userId);
    session.step3Messages.set(
      dead.userId,
      t(lang, "nightRavenkeeperPlaceholder"),
    );
    session.step3OutcomeMeta.set(dead.userId, {
      kind: "fixed",
      reasonEn: "placeholder for Ravenkeeper follow-up",
      reasonZh: "守鸦人后续占位结算",
    });
  }
}

async function sendStep3Messages(
  client: Client,
  state: GameState,
): Promise<void> {
  const runtime = ensureRuntime(state);
  const session = runtime.nightSession;
  if (!session) return;

  for (const player of state.players) {
    const content = session.step3Messages.get(player.userId);
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
  if (!runtime.playerStates.get(player.userId)?.alive) return true;

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
      session.status = "awaiting_storyteller_step3";
      const storyteller = await client.users.fetch(state.storytellerId);
      const stLang = getLang(storyteller.id);
      const step2Summary = buildStep2Summary(state, stLang);
      session.step3Preview = buildStep3Preview(state, stLang);
      updateGame(state);
      await storyteller.send(
        t(stLang, "nightStep3Preview", {
          n: session.nightNumber,
          summary: step2Summary,
          preview: session.step3Preview ?? "",
        }),
      );
    } else {
      await sendStep3Messages(client, state);
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

  if (session.status === "awaiting_storyteller_step1") {
    if (cmd !== "SEND") {
      await message.reply(t(stLang, "nightStep1SendPrompt"));
      return true;
    }

    session.status = "awaiting_players";
    updateGame(state);

    for (const p of getAlivePlayers(state)) {
      const step1 = session.step1Messages.get(p.userId);
      if (!step1) continue;
      await sendPlayerDm(_client, p, state, step1);
    }

    await message.reply(t(stLang, "nightStep1Dispatched"));
    return true;
  }

  if (session.status === "awaiting_storyteller_step3") {
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

        const draft = session.step3OutcomeDrafts.get(target.userId);
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

        session.step3OutcomeDrafts.set(target.userId, draft);
        const targetLang = getLang(target.userId);
        session.step3Messages.set(
          target.userId,
          renderOutcomeDraft(state, targetLang, draft),
        );
        const prevMeta = session.step3OutcomeMeta.get(target.userId);
        session.step3OutcomeMeta.set(target.userId, {
          kind: prevMeta?.kind ?? "fixed",
          reasonEn: `storyteller set ${field}`,
          reasonZh: `说书人字段覆盖 ${field}`,
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

        const targetDraft = session.step3OutcomeDrafts.get(target.userId);
        const targetCanArbitrary = targetDraft?.allowArbitraryOverride ?? false;
        if (!targetCanArbitrary) {
          await message.reply(
            t(stLang, "nightOverrideRejected", {
              player: target.displayName,
            }),
          );
          return true;
        }

        session.step3Messages.set(target.userId, content);
        session.step3OutcomeDrafts.delete(target.userId);
        session.step3OutcomeMeta.set(target.userId, {
          kind: "fixed",
          reasonEn: "storyteller override",
          reasonZh: "说书人覆盖",
        });
        continue;
      }

      await message.reply(t(stLang, "nightUnrecognizedInput"));
      return true;
    }

    if (!shouldSend) {
      session.step3Preview = buildStep3Preview(state, stLang);
      updateGame(state);
      await message.reply(
        t(stLang, "nightEditsApplied", {
          preview: session.step3Preview ?? "",
        }),
      );
      return true;
    }

    await message.reply(t(stLang, "nightStep3Sending"));
    await sendStep3Messages(_client, state);
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
