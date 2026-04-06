import { Client, Message } from "discord.js";
import {
  getGameByPlayer,
  getGameByStoryteller,
  getGamesByTestOwner,
  updateGame,
} from "../game/state";
import { handleNightPlayerDm } from "../game/night";
import { handleRoleStorytellerDm } from "../game/roleCommands";
import { Player } from "../game/types";

function resolveFakePlayer(
  name: string,
  players: Player[],
): Player | undefined {
  const lower = name.toLowerCase();
  const fakes = players.filter((p) => p.isTestPlayer);

  const exact = fakes.find(
    (p) =>
      p.username.toLowerCase() === lower ||
      p.displayName.toLowerCase() === lower,
  );
  if (exact) return exact;

  const prefix = fakes.filter(
    (p) =>
      p.username.toLowerCase().startsWith(lower) ||
      p.displayName.toLowerCase().startsWith(lower),
  );
  if (prefix.length === 1) return prefix[0];
  return undefined;
}

function parseAsPrefix(
  content: string,
): { playerName: string; payload: string } | null {
  const trimmed = content.trim();
  const match = /^!as\s+(\S+)\s+([\s\S]+)$/i.exec(trimmed);
  if (!match) return null;
  return { playerName: match[1], payload: match[2].trim() };
}

async function handleNightDmAsFakePlayer(
  message: Message,
  client: Client,
): Promise<boolean> {
  const parsed = parseAsPrefix(message.content);
  if (!parsed) return false;

  const games = getGamesByTestOwner(message.author.id);
  for (const state of games) {
    const fake = resolveFakePlayer(parsed.playerName, state.players);
    if (!fake) continue;

    const clonedMessage = Object.create(message) as Message;
    Object.defineProperty(clonedMessage, "content", { value: parsed.payload });
    Object.defineProperty(clonedMessage, "author", {
      value: {
        ...message.author,
        id: fake.userId,
      },
    });

    const handled = await handleNightPlayerDm(clonedMessage, client, state);
    if (handled) {
      updateGame(state);
      return true;
    }
  }

  return false;
}

export async function handleNightDm(
  message: Message,
  client: Client,
): Promise<boolean> {
  // Manual storyteller DM controls (night and day).
  const stState = getGameByStoryteller(message.author.id);
  if (stState && stState.mode === "manual" && stState.phase === "in_progress") {
    // Day-phase storyteller commands (e.g. SLAY KILL / SLAY NOTHING)
    const roleHandled = await handleRoleStorytellerDm(message, client, stState);
    if (roleHandled) {
      updateGame(stState);
      return true;
    }

  }

  // Real player night responses.
  const playerState = getGameByPlayer(message.author.id);
  if (playerState && playerState.phase === "in_progress") {
    const handled = await handleNightPlayerDm(message, client, playerState);
    if (handled) {
      updateGame(playerState);
      return true;
    }
  }

  // Test-owner proxy DM replies for fake players.
  if (await handleNightDmAsFakePlayer(message, client)) {
    return true;
  }

  return false;
}
