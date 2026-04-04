import { Client } from "discord.js";
import { ActiveGameState } from "./types";
import { ALL_ROLE_DEFINITIONS } from "../roles/index";
import type { DeathCtx } from "../roles/types";

/**
 * Iterates all role definitions and invokes any registered death handlers,
 * passing context about which player died, in which phase, and whether the
 * death was caused by execution.
 *
 * Handlers are called in role-list order and iteration stops early if the
 * game ends (state.phase === "ended") mid-loop.
 */
export async function triggerDeathHandlers(
  client: Client,
  state: ActiveGameState,
  deadPlayerId: string,
  phase: "day" | "night",
  byExecution: boolean,
): Promise<void> {
  const ctx: DeathCtx = { state, client, deadPlayerId, phase, byExecution };
  for (const def of ALL_ROLE_DEFINITIONS) {
    if (!def.deathHandler) continue;
    await def.deathHandler.onDeath(ctx);
    if (state.phase === "ended") break;
  }
}
