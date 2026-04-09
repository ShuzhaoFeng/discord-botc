import {
  Client,
  ChatInputCommandInteraction,
  Message,
  SlashCommandBuilder,
} from "discord.js";
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";
import { ALL_ROLE_DEFINITIONS } from "../roles/index";
import { getGame } from "./state";
import type { ActiveGameState, GameState } from "./types";
import type { DayGameCtx } from "../roles/types";
import { notifyStoryteller, playerDisplayName } from "./utils";
import { cancelActiveNomination, killPlayerDuringDay } from "./day";

export function getRoleCommandBuilders(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return ALL_ROLE_DEFINITIONS.flatMap((d) => d.commands ?? []).map((cmd) =>
    cmd.configure(new SlashCommandBuilder().setName(cmd.name)).toJSON(),
  );
}

export async function handleRoleCommand(
  i: ChatInputCommandInteraction,
  client: Client,
): Promise<boolean> {
  // 1. Find matching RoleCommandDefinition across all role definitions.
  const cmd = ALL_ROLE_DEFINITIONS.flatMap((d) => d.commands ?? []).find(
    (c) => c.name === i.commandName,
  );
  if (!cmd) return false;

  // 2. Validate channel context.
  const isDm = i.channel?.isDMBased() ?? i.guildId === null;
  const isGuild = i.guildId !== null;

  if (cmd.allowedChannel === "public" && isDm) {
    await i.reply({
      content: "This command can only be used in a server channel.",
      ephemeral: true,
    });
    return true;
  }
  if (cmd.allowedChannel === "dm" && isGuild) {
    await i.reply({
      content: "This command can only be used in a DM.",
      ephemeral: true,
    });
    return true;
  }

  // 3. Look up game state by channelId.
  const channelId = i.channelId;
  const state = getGame(channelId);
  if (!state) {
    await i.reply({
      content: "No active game in this channel.",
      ephemeral: true,
    });
    return true;
  }

  // 4. Check state.phase === "in_progress".
  if (state.phase !== "in_progress") {
    await i.reply({
      content: "No active game in this channel.",
      ephemeral: true,
    });
    return true;
  }

  // 5. Use state.runtime directly (do NOT call ensureRuntime).
  const runtime = state.runtime;
  if (!runtime) {
    await i.reply({
      content: "No active game in this channel.",
      ephemeral: true,
    });
    return true;
  }

  // 6. Validate phase.
  if (cmd.allowedPhase === "day" && runtime.daySession?.status !== "open") {
    await i.reply({
      content: "This command can only be used during the day phase.",
      ephemeral: true,
    });
    return true;
  }
  if (cmd.allowedPhase === "night" && runtime.nightSession === null) {
    await i.reply({
      content: "This command can only be used during the night phase.",
      ephemeral: true,
    });
    return true;
  }

  // 7. Build DayGameCtx.
  const ctx: DayGameCtx = {
    state: state as ActiveGameState,
    client,
    playerDisplayName: (userId) => playerDisplayName(state, userId),
    notifyStoryteller: (content) => notifyStoryteller(client, state, content),
    day: {
      killPlayerDuringDay: (channel, playerId, byExecution) =>
        killPlayerDuringDay(client, state, channel, playerId, byExecution),
      cancelActiveNomination: (channel, killedPlayerId) =>
        cancelActiveNomination(client, state, channel, killedPlayerId),
    },
  };

  // 8. Dispatch.
  await cmd.execute(i, ctx);
  return true;
}

export async function handleRoleStorytellerDm(
  message: Message,
  client: Client,
  state: GameState,
): Promise<boolean> {
  const runtime = state.runtime;
  if (!runtime) return false;
  const assignedRoleIds = new Set(
    [...state.draft!.assignments.values()].map((r) => r.id),
  );
  const ctx: DayGameCtx = {
    state: state as ActiveGameState,
    client,
    playerDisplayName: (userId) => playerDisplayName(state, userId),
    notifyStoryteller: (content) => notifyStoryteller(client, state, content),
    day: {
      killPlayerDuringDay: (channel, playerId, byExecution) =>
        killPlayerDuringDay(client, state, channel, playerId, byExecution),
      cancelActiveNomination: (channel, killedPlayerId) =>
        cancelActiveNomination(client, state, channel, killedPlayerId),
    },
  };
  for (const def of ALL_ROLE_DEFINITIONS) {
    if (!assignedRoleIds.has(def.id)) continue;
    if (def.handleStorytellerDm) {
      if (await def.handleStorytellerDm(message, ctx)) return true;
    }
  }
  return false;
}
