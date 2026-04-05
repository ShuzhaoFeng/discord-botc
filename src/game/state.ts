import { GameState, FAKE_PLAYER_ID_PREFIX } from "./types";

/** All active games, keyed by channelId. */
const games = new Map<string, GameState>();

/** Map from storyteller userId → channelId (for routing DMs). */
const storytellerChannel = new Map<string, string>();

/** Optional hook called whenever a game is updated; used by the admin UI. */
let updateHook: ((state: GameState) => void) | null = null;

export function setUpdateHook(fn: (state: GameState) => void): void {
  updateHook = fn;
}

export function getAllGames(): GameState[] {
  return [...games.values()];
}

/** Monotonically increasing game counter for readable game IDs. */
let gameCounter = 0;

export function nextGameNumber(): number {
  return ++gameCounter;
}

export function createGame(state: GameState): void {
  games.set(state.channelId, state);
}

export function getGame(channelId: string): GameState | undefined {
  return games.get(channelId);
}

export function getGameByStoryteller(userId: string): GameState | undefined {
  const channelId = storytellerChannel.get(userId);
  if (!channelId) return undefined;
  return games.get(channelId);
}

export function getGameByPlayer(userId: string): GameState | undefined {
  for (const game of games.values()) {
    if (game.players.some((p) => p.userId === userId)) return game;
  }
  return undefined;
}

export function getGamesByTestOwner(userId: string): GameState[] {
  const out: GameState[] = [];
  for (const game of games.values()) {
    if (game.testMode && game.testOwnerId === userId) out.push(game);
  }
  return out;
}

export function setStoryteller(userId: string, channelId: string): void {
  storytellerChannel.set(userId, channelId);
}

export function removeStoryteller(userId: string): void {
  storytellerChannel.delete(userId);
}

export function updateGame(state: GameState): void {
  games.set(state.channelId, state);
  updateHook?.(state);
}

export function deleteGame(channelId: string): void {
  const state = games.get(channelId);
  if (state) {
    // If a fake player is the storyteller, the DM routing map is keyed by testOwnerId
    // (not the fake userId, which has no real Discord account).
    const mapKey =
      state.testMode &&
      state.testOwnerId &&
      state.storytellerId?.startsWith(FAKE_PLAYER_ID_PREFIX)
        ? state.testOwnerId
        : state.storytellerId;
    if (mapKey) storytellerChannel.delete(mapKey);
  }
  games.delete(channelId);
}
