import type { GameState } from "../game/types";

export function playerDisplayName(state: GameState, userId: string): string {
  return state.players.find((p) => p.userId === userId)?.displayName ?? userId;
}
