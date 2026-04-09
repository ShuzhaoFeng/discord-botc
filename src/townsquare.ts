/**
 * Townsquare spectator — connects to a clocktower.live session as a read-only
 * spectator and syncs alive/dead status back to the bot's game state.
 *
 * See CONNECTION.md for protocol details.
 */

import crypto from "crypto";
import WebSocket from "ws";
import { Client, TextChannel } from "discord.js";
import { GameState } from "./game/types";
import { getGame, updateGame } from "./game/state";
import { processEndOfDay } from "./game/day";

// ─── Authentication helpers ─────────────────────────────────────────────────

const SECRET_PREFIX = Buffer.from([
  155, 113, 7, 193, 229, 225, 124, 147, 153, 27, 254, 60, 164, 234, 108, 10,
]);

function generatePlayerCredentials(): { playerId: string; secret: string } {
  const secretBytes = crypto.randomBytes(32);
  const toHash = Buffer.concat([SECRET_PREFIX, secretBytes]);
  const hash = crypto.createHash("sha256").update(toHash).digest();
  const playerId =
    "__s_" + hash.toString("base64url");
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
 * Applies alive/dead changes from townsquare to the bot's runtime state.
 * Matches players by displayName (case-insensitive). If no names match,
 * the update is silently ignored.
 */
function syncAliveStatus(
  channelId: string,
  townsquarePlayers: TownsquarePlayer[],
): void {
  const state = getGame(channelId);
  if (!state?.runtime) return;

  // Build a lookup from lowercased townsquare name → isDead
  const tsLookup = new Map<string, boolean>();
  for (const tp of townsquarePlayers) {
    tsLookup.set(tp.name.toLowerCase(), tp.isDead);
  }

  let changed = false;
  for (const ps of state.runtime.playerStates) {
    const isDead = tsLookup.get(ps.player.displayName.toLowerCase());
    if (isDead === undefined) continue; // no match — skip
    const newAlive = !isDead;
    if (ps.alive !== newAlive) {
      ps.alive = newAlive;
      changed = true;
    }
  }

  if (changed) {
    updateGame(state);
  }
}

// ─── Day→Night transition ───────────────────────────────────────────────────

/**
 * Called when the townsquare `isNight` value changes. If the transition is
 * day→night and the bot currently has an open day session, ends the day and
 * starts the next night phase.
 */
async function handleIsNightChange(
  channelId: string,
  isNight: boolean,
  discordClient: Client,
): Promise<void> {
  const prev = cachedIsNight.get(channelId);
  cachedIsNight.set(channelId, isNight);

  // Only act on day→night transitions (prev was false, now true)
  if (prev !== false || isNight !== true) return;

  const state = getGame(channelId);
  if (!state?.runtime) return;

  const daySession = state.runtime.daySession;
  if (!daySession || daySession.status !== "open") return;

  console.log(
    `[Townsquare] Day→Night transition detected for game ${state.gameId}, ending day`,
  );

  try {
    const channel = (await discordClient.channels.fetch(
      state.channelId,
    )) as TextChannel;
    // Mark day as ending so no new nominations are accepted
    daySession.dayEndsAfterNomination = true;
    updateGame(state);

    if (!daySession.activeNomination) {
      await processEndOfDay(discordClient, state, channel);
    }
    // If there's an active nomination, processEndOfDay will be called
    // when the nomination window closes (existing logic in day.ts).
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
  // Full URL with hash fragment
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx !== -1) {
    return trimmed.slice(hashIdx + 1);
  }
  // Plain session name
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

  // Clean up any existing connection for this game
  disconnectTownsquare(channelId);

  const { playerId, secret } = generatePlayerCredentials();

  // Derive WebSocket URL from townsquareUrl
  // townsquareUrl might be "clocktower.live" or "https://clocktower.live" etc.
  const host = townsquareUrl
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
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

    // Request full game state from the host
    ws.send(JSON.stringify(["direct", { host: ["getGamestate", playerId] }]));

    // Keepalive every 30s
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
          // Full or lightweight gamestate
          const gs = params as TownsquareGamestate;
          if (gs.gamestate) {
            cachedPlayers.set(channelId, gs.gamestate);
            syncAliveStatus(channelId, gs.gamestate);
          }
          if (gs.isNight !== undefined) {
            handleIsNightChange(channelId, gs.isNight, discordClient);
          }
          break;
        }
        case "player": {
          // Incremental player property change: { index, property, value }
          const { index, property, value } = params as {
            index: number;
            property: string;
            value: unknown;
          };
          const cached = cachedPlayers.get(channelId);
          if (cached && index >= 0 && index < cached.length) {
            (cached[index] as Record<string, unknown>)[property] = value;
            if (property === "isDead") {
              syncAliveStatus(channelId, cached);
            }
          }
          break;
        }
        case "swap": {
          // Swap two player positions: [idx1, idx2]
          const [idx1, idx2] = params as [number, number];
          const cached2 = cachedPlayers.get(channelId);
          if (cached2 && idx1 < cached2.length && idx2 < cached2.length) {
            [cached2[idx1], cached2[idx2]] = [cached2[idx2], cached2[idx1]];
          }
          break;
        }
        case "isNight": {
          // Incremental day/night toggle
          handleIsNightChange(channelId, params as boolean, discordClient);
          break;
        }
        case "remove": {
          // Remove a player at index
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
    console.error(`[Townsquare] WebSocket error for session "${parsedSession}":`, err.message);
  });
}
