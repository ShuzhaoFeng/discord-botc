import { Client } from 'discord.js';
import { Player, GameState } from '../game/types';

/**
 * Sends a DM to a player.
 *
 * In test mode (`state.testMode === true`), DMs intended for fake players
 * (`player.isTestPlayer === true`) are redirected to the test owner instead,
 * prefixed with a label so the tester knows which player received what.
 *
 * Throws on failure — callers should catch and report in the game channel.
 */
export async function sendPlayerDm(
  client: Client,
  player: Player,
  state: GameState,
  content: string,
): Promise<void> {
  if (state.testMode && player.isTestPlayer && state.testOwnerId) {
    const testOwner = await client.users.fetch(state.testOwnerId);
    await testOwner.send(`📨 **[DM → ${player.displayName}]**\n\n${content}`);
  } else {
    const user = await client.users.fetch(player.userId);
    await user.send(content);
  }
}
