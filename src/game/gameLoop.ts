/**
 * Top-level game flow: alternates night → day until a win condition fires
 * and `state.phase` becomes "ended".
 *
 * Each phase function sets `runtime.phaseCompletion` to a resolver and runs
 * its setup synchronously. The phase's terminal step (sendInfoMessages /
 * sendDeathNarrativeConfirmations for night; processEndOfDay for day) calls
 * that resolver, which wakes the loop here.
 */

import { Client } from "discord.js";
import { GameState } from "./types";
import { runNightPhase } from "./night";
import { runDayPhase } from "./dayFlow";

export async function runGameLoop(
  client: Client,
  state: GameState,
): Promise<void> {
  while (state.phase === "in_progress") {
    await runNightPhase(client, state);
    if (state.phase !== "in_progress") break;
    await runDayPhase(client, state);
  }
}
