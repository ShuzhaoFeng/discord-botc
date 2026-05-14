/**
 * Read-only spectator connection to a clocktower.live session that mirrors
 * alive/dead status into bot state. Alive→dead transitions go through
 * `killPlayer` (full death pipeline + win check); the daySession's
 * `townsquareDeathByExecution` toggle decides `byExecution`.
 */

import crypto from "crypto";
import WebSocket from "ws";
import { Client, TextChannel } from "discord.js";
import { GameState } from "./game/types";
import { getGame, updateGame } from "./game/state";
import { processEndOfDay } from "./game/dayFlow";
import { killPlayer, revivePlayer } from "./game/death";

// ─── Authentication helpers ─────────────────────────────────────────────────

const SECRET_PREFIX = Buffer.from([
  155, 113, 7, 193, 229, 225, 124, 147, 153, 27, 254, 60, 164, 234, 108, 10,
]);

function generatePlayerCredentials(): { playerId: string; secret: string } {
  const secretBytes = crypto.randomBytes(32);
  const toHash = Buffer.concat([SECRET_PREFIX, secretBytes]);
  const hash = crypto.createHash("sha256").update(toHash).digest();
  const playerId = "__s_" + hash.toString("base64url");
  const secret = secretBytes.toString("base64url");
  return { playerId, secret };
}

// ─── Active connections ─────────────────────────────────────────────────────

/** One spectator connection per channelId. */
const activeConnections = new Map<string, WebSocket>();

/** Cached townsquare player list per channelId (for incremental updates). */
const cachedPlayers = new Map<string, TownsquarePlayer[]>();

/** Cached isNight value per channelId (for detecting day→night transitions). */
const cachedIsNight = new Map<string, boolean>();

export function disconnectTownsquare(channelId: string): void {
  const ws = activeConnections.get(channelId);
  if (ws) {
    ws.close();
    activeConnections.delete(channelId);
  }
  cachedPlayers.delete(channelId);
  cachedIsNight.delete(channelId);
}

// ─── Townsquare gamestate shape ─────────────────────────────────────────────

interface TownsquarePlayer {
  name: string;
  id: string;
  isDead: boolean;
  isVoteless: boolean;
  [key: string]: unknown;
}

interface TownsquareGamestate {
  gamestate: TownsquarePlayer[];
  isLightweight?: boolean;
  isNight?: boolean;
  [key: string]: unknown;
}

// ─── Sync logic ─────────────────────────────────────────────────────────────

/**
 * Day phase: byExecution from the storyteller's toggle.
 * Night phase: never an execution.
 * Other phases: no sync (returns null).
 */
function resolveKillContext(
  state: GameState,
): { phase: "day" | "night"; byExecution: boolean } | null {
  if (state.phase !== "in_progress" || !state.runtime) return null;
  const daySession = state.runtime.daySession;
  if (daySession?.status === "open") {
    return { phase: "day", byExecution: daySession.townsquareDeathByExecution };
  }
  return { phase: "night", byExecution: false };
}

/** Townsquare players unmatched by displayName are skipped. */
async function syncAliveStatus(
  channelId: string,
  townsquarePlayers: TownsquarePlayer[],
  discordClient: Client,
): Promise<void> {
  const state = getGame(channelId);
  if (!state?.runtime) return;

  const tsLookup = new Map<string, boolean>();
  for (const tp of townsquarePlayers) {
    tsLookup.set(tp.name.toLowerCase(), tp.isDead);
  }

  const newlyDeadIds: string[] = [];
  const newlyAliveIds: string[] = [];

  for (const ps of state.runtime.playerStates) {
    const isDead = tsLookup.get(ps.player.displayName.toLowerCase());
    if (isDead === undefined) continue;

    if (ps.alive && isDead) {
      newlyDeadIds.push(ps.player.userId);
    } else if (!ps.alive && !isDead) {
      newlyAliveIds.push(ps.player.userId);
    }
  }

  for (const id of newlyAliveIds) {
    revivePlayer(state, id);
  }

  if (newlyDeadIds.length === 0) return;

  const ctx = resolveKillContext(state);
  if (!ctx) return;

  for (const id of newlyDeadIds) {
    await killPlayer(discordClient, state, id, {
      phase: ctx.phase,
      byExecution: ctx.byExecution,
      announce: ctx.phase === "day",
    });
  }
}

// ─── Day→Night transition ───────────────────────────────────────────────────

/** Only acts on day→night transitions; other flips are no-ops. */
async function handleIsNightChange(
  channelId: string,
  isNight: boolean,
  discordClient: Client,
): Promise<void> {
  const prev = cachedIsNight.get(channelId);
  cachedIsNight.set(channelId, isNight);

  if (prev !== false || isNight !== true) return;

  const state = getGame(channelId);
  if (!state?.runtime) return;

  const daySession = state.runtime.daySession;
  if (!daySession || daySession.status !== "open") return;

  console.log(
    `[Townsquare] Day→Night transition for game ${state.gameId}, ending day`,
  );

  try {
    const channel = (await discordClient.channels.fetch(
      state.channelId,
    )) as TextChannel;
    daySession.dayEndsAfterNomination = true;
    updateGame(state);

    if (!daySession.activeNomination) {
      await processEndOfDay(discordClient, state, channel);
    }
  } catch (err) {
    console.error("[Townsquare] Error ending day:", err);
  }
}

// ─── Connect ────────────────────────────────────────────────────────────────

/**
 * Parses a session name from various input formats:
 *   "foobar"                              → "foobar"
 *   "#foobar"                             → "foobar"
 *   "https://clocktower.live/#foobar"     → "foobar"
 *   "http://clocktower.live/#foobar"      → "foobar"
 */
function parseSessionName(raw: string): string {
  const trimmed = raw.trim();
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx !== -1) {
    return trimmed.slice(hashIdx + 1);
  }
  return trimmed;
}

/**
 * Connects to a townsquare session as a spectator. Fires and forgets —
 * errors are logged but do not propagate.
 */
export function connectTownsquareSpectator(
  state: GameState,
  townsquareUrl: string,
  sessionName: string,
  discordClient: Client,
): void {
  const { channelId } = state;
  const parsedSession = parseSessionName(sessionName);
  if (!parsedSession) return;

  disconnectTownsquare(channelId);

  const { playerId, secret } = generatePlayerCredentials();

  const host = townsquareUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const wsUrl = `wss://${host}:8001/${encodeURIComponent(parsedSession)}/${playerId}?secret=${secret}`;

  console.log(
    `[Townsquare] Connecting to session "${parsedSession}" at ${host} for game ${state.gameId}`,
  );

  const ws = new WebSocket(wsUrl, {
    origin: `https://${host}`,
  });

  activeConnections.set(channelId, ws);

  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  ws.on("open", () => {
    console.log(`[Townsquare] Connected to session "${parsedSession}"`);

    ws.send(JSON.stringify(["direct", { host: ["getGamestate", playerId] }]));

    keepaliveInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(["ping", [playerId, "latency"]]));
      }
    }, 30_000);
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as unknown;
      if (!Array.isArray(msg) || msg.length < 2) return;

      const [command, params] = msg as [string, unknown];

      switch (command) {
        case "gs": {
          const gs = params as TownsquareGamestate;
          if (gs.gamestate) {
            cachedPlayers.set(channelId, gs.gamestate);
            syncAliveStatus(channelId, gs.gamestate, discordClient).catch(
              (err) =>
                console.error("[Townsquare] syncAliveStatus error:", err),
            );
          }
          if (gs.isNight !== undefined) {
            handleIsNightChange(channelId, gs.isNight, discordClient);
          }
          break;
        }
        case "player": {
          const { index, property, value } = params as {
            index: number;
            property: string;
            value: unknown;
          };
          const cached = cachedPlayers.get(channelId);
          if (cached && index >= 0 && index < cached.length) {
            (cached[index] as Record<string, unknown>)[property] = value;
            if (property === "isDead") {
              syncAliveStatus(channelId, cached, discordClient).catch((err) =>
                console.error("[Townsquare] syncAliveStatus error:", err),
              );
            }
          }
          break;
        }
        case "swap": {
          const [idx1, idx2] = params as [number, number];
          const cached2 = cachedPlayers.get(channelId);
          if (cached2 && idx1 < cached2.length && idx2 < cached2.length) {
            [cached2[idx1], cached2[idx2]] = [cached2[idx2], cached2[idx1]];
          }
          break;
        }
        case "isNight": {
          handleIsNightChange(channelId, params as boolean, discordClient);
          break;
        }
        case "remove": {
          const cached3 = cachedPlayers.get(channelId);
          if (cached3) {
            const idx = params as number;
            if (idx >= 0 && idx < cached3.length) {
              cached3.splice(idx, 1);
            }
          }
          break;
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on("close", () => {
    console.log(
      `[Townsquare] Disconnected from session "${parsedSession}" (game ${state.gameId})`,
    );
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    activeConnections.delete(channelId);
    cachedPlayers.delete(channelId);
    cachedIsNight.delete(channelId);
  });

  ws.on("error", (err) => {
    console.error(
      `[Townsquare] WebSocket error for session "${parsedSession}":`,
      err.message,
    );
  });
}
