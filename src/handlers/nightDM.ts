import { Client, Message } from "discord.js";
import {
  getGameByPlayer,
  getGameByStoryteller,
  getGamesByTestOwner,
  updateGame,
} from "../game/state";
import { handleNightPlayerDM } from "../game/night";
import { handleRoleStorytellerDM } from "../game/roleCommands";
import { resolvePlayer } from "../game/utils";

function parseAsPrefix(
  content: string,
): { playerName: string; payload: string } | null {
  const trimmed = content.trim();
  const match = /^!as\s+(\S+)\s+([\s\S]+)$/i.exec(trimmed);
  if (!match) return null;
  return { playerName: match[1], payload: match[2].trim() };
}

async function handleNightDMAsFakePlayer(
  message: Message,
  client: Client,
): Promise<boolean> {
  const parsed = parseAsPrefix(message.content);
  if (!parsed) return false;

  const games = getGamesByTestOwner(message.author.id);
  for (const state of games) {
    const fake = resolvePlayer(
      parsed.playerName,
      state.players,
      (p) => p.isTestPlayer === true,
    );
    if (!fake) continue;

    const clonedMessage = Object.create(message) as Message;
    Object.defineProperty(clonedMessage, "content", { value: parsed.payload });
    Object.defineProperty(clonedMessage, "author", {
      value: {
        ...message.author,
        id: fake.userId,
      },
    });

    const handled = await handleNightPlayerDM(clonedMessage, client, state);
    if (handled) {
      updateGame(state);
      return true;
    }
  }

  return false;
}

export async function handleNightDM(
  message: Message,
  client: Client,
): Promise<boolean> {
  // Manual storyteller DM controls (night and day).
  const stState = getGameByStoryteller(message.author.id);
  if (stState && stState.mode === "manual" && stState.phase === "in_progress") {
    // Day-phase storyteller commands (e.g. SLAY KILL / SLAY NOTHING)
    const roleHandled = await handleRoleStorytellerDM(message, client, stState);
    if (roleHandled) {
      updateGame(stState);
      return true;
    }
  }

  // Real player night responses.
  const playerState = getGameByPlayer(message.author.id);
  if (playerState && playerState.phase === "in_progress") {
    const handled = await handleNightPlayerDM(message, client, playerState);
    if (handled) {
      updateGame(playerState);
      return true;
    }
  }

  // Test-owner proxy DM replies for fake players.
  if (await handleNightDMAsFakePlayer(message, client)) {
    return true;
  }

  return false;
}
