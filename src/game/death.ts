import { Client } from "discord.js";
import { ActiveGameState } from "./types";
import { ALL_ROLE_DEFINITIONS } from "../roles/index";
import type { DeathCtx } from "../roles/types";

/** Invoke all registered death handlers; stops early if the game ends mid-loop. */
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
