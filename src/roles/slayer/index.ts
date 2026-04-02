import type { RoleDefinition, RoleCommandDefinition, DayGameCtx } from "../types";
import { SlashCommandBuilder, Message, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { getLang, t } from "../../i18n";
import { getPlayerState, getRole, resolvePlayer, channelLang } from "../../game/utils";
import {
  killPlayerDuringDay,
  playerDisplayName,
  cancelActiveNomination,
  notifyStoryteller,
} from "../../game/day";
import { updateGame } from "../../game/state";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

const slayCommand: RoleCommandDefinition = {
  name: "slay",
  configure: (b: SlashCommandBuilder) =>
    b
      .setDescription(
        "Claim to be the Slayer and attempt to slay a player (day phase).",
      )
      .addStringOption((opt) =>
        opt
          .setName("player")
          .setDescription("Name of the player to slay")
          .setRequired(true),
      ) as SlashCommandBuilder,
  allowedPhase: "day",
  allowedChannel: "public",
  execute: async (i: ChatInputCommandInteraction, ctx: DayGameCtx) => {
    const { state } = ctx;
    const runtime = state.runtime;
    const lang = getLang(i.user.id);

    // Storyteller cannot use /slay
    if (state.storytellerId === i.user.id) {
      await i.reply({
        content: t(lang, "dayStorytellerCannotSlay"),
        ephemeral: true,
      });
      return;
    }

    const player = state.players.find((p) => p.userId === i.user.id);
    if (!player) {
      await i.reply({ content: t(lang, "dayNotAPlayer"), ephemeral: true });
      return;
    }

    const daySession = runtime.daySession;
    if (!daySession || daySession.status !== "open") {
      await i.reply({ content: t(lang, "dayNotDaytime"), ephemeral: true });
      return;
    }

    // Must be alive to use /slay
    const playerState = getPlayerState(runtime, i.user.id);
    if (!playerState?.alive) {
      await i.reply({ content: t(lang, "dayDeadCannotSlay"), ephemeral: true });
      return;
    }

    const targetInput = i.options.getString("player", true);
    const target = resolvePlayer(targetInput, state.players);
    if (!target) {
      await i.reply({
        content: t(lang, "dayUnknownPlayer", { player: targetInput }),
        ephemeral: true,
      });
      return;
    }

    const targetState = getPlayerState(runtime, target.userId);
    if (!targetState?.alive) {
      await i.reply({
        content: t(lang, "daySlayTargetDead", { player: target.displayName }),
        ephemeral: true,
      });
      return;
    }

    // Determine the scenario
    const realRole = getRole(runtime, i.user.id);
    const targetRole = getRole(runtime, target.userId);
    const isRealSlayer = realRole.id === "slayer";
    const slayerPoisoned = playerState.tags.has("poisoned");

    // Publicly announce the attempt
    const channel = (await ctx.client.channels.fetch(
      state.channelId,
    )) as TextChannel;
    await i.reply(
      t(lang, "daySlayAnnounce", {
        slayer: player.displayName,
        target: target.displayName,
      }),
    );

    // Scenario 1: Not the real Slayer (bluffing) or Drunk → nothing happens
    // Scenario 2: Real Slayer but poisoned → nothing happens (doesn't consume ability)
    // Scenario 3: Real Slayer, not poisoned, not used yet, target not Recluse
    // Scenario 4: Real Slayer, not poisoned, not used yet, target is Recluse

    if (!isRealSlayer) {
      // Scenario 1: bluffing
      if (state.mode === "manual") {
        daySession.pendingSlayFixed = {
          slayerId: i.user.id,
          targetId: target.userId,
          outcome: "nothing",
        };
        updateGame(state);
        await channel.send(t(lang, "daySlayPending"));
        const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
        notifyStoryteller(
          ctx.client,
          state,
          t(stLang, "daySlayBluffStNotify", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      } else {
        await channel.send(t(lang, "dayNothingHappens"));
        notifyStoryteller(
          ctx.client,
          state,
          t(lang, "daySlayBluffStLog", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      }
      return;
    }

    if (slayerPoisoned) {
      // Scenario 2: poisoned Slayer — doesn't consume ability
      if (state.mode === "manual") {
        daySession.pendingSlayFixed = {
          slayerId: i.user.id,
          targetId: target.userId,
          outcome: "nothing",
        };
        updateGame(state);
        await channel.send(t(lang, "daySlayPending"));
        const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
        notifyStoryteller(
          ctx.client,
          state,
          t(stLang, "daySlayPoisonedStNotify", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      } else {
        await channel.send(t(lang, "dayNothingHappens"));
        notifyStoryteller(
          ctx.client,
          state,
          t(lang, "daySlayPoisonedStLog", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      }
      return;
    }

    if (playerState.tags.has("slayer_used")) {
      // Already used their ability — treated as Scenario 1 (nothing happens)
      if (state.mode === "manual") {
        daySession.pendingSlayFixed = {
          slayerId: i.user.id,
          targetId: target.userId,
          outcome: "nothing",
        };
        updateGame(state);
        await channel.send(t(lang, "daySlayPending"));
        const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
        notifyStoryteller(
          ctx.client,
          state,
          t(stLang, "daySlayUsedStNotify", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      } else {
        await channel.send(t(lang, "dayNothingHappens"));
        notifyStoryteller(
          ctx.client,
          state,
          t(lang, "daySlayUsedStLog", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      }
      return;
    }

    // Scenarios 3 & 4: Real Slayer, not poisoned, ability not yet used
    playerState.tags.add("slayer_used");
    updateGame(state);

    if (targetRole.id === "recluse") {
      // Scenario 4: Recluse target
      const proposedKill = Math.random() < 0.5;

      if (state.mode === "automated") {
        if (proposedKill) {
          await channel.send(
            t(lang, "daySlayRecluseKill", { target: target.displayName }),
          );
          const gameEnded = await killPlayerDuringDay(
            ctx.client,
            state,
            channel,
            target.userId,
          );
          if (!gameEnded && daySession.activeNomination) {
            if (daySession.activeNomination.nomineeId === target.userId) {
              await cancelActiveNomination(
                ctx.client,
                state,
                channel,
                target.userId,
              );
            }
          }
        } else {
          await channel.send(t(lang, "daySlayRecluseNothing"));
        }
      } else {
        // Manual mode: storyteller decides
        daySession.pendingSlayRecluse = {
          slayerId: i.user.id,
          targetId: target.userId,
          proposedKill,
        };
        updateGame(state);

        await channel.send(t(lang, "daySlayPending"));

        const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
        const proposal = proposedKill
          ? t(stLang, "daySlayRecluseProposalKill")
          : t(stLang, "daySlayRecluseProposalNothing");
        notifyStoryteller(
          ctx.client,
          state,
          t(stLang, "daySlayRecluseStNotify", {
            slayer: player.displayName,
            target: target.displayName,
            proposal,
          }),
        );
      }
      return;
    }

    // Scenario 3: Real Slayer, not Recluse target
    if (targetRole.id === "imp") {
      // Demon dies
      if (state.mode === "manual") {
        daySession.pendingSlayFixed = {
          slayerId: i.user.id,
          targetId: target.userId,
          outcome: "kill",
        };
        updateGame(state);
        await channel.send(t(lang, "daySlayPending"));
        const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
        notifyStoryteller(
          ctx.client,
          state,
          t(stLang, "daySlayDemonStNotify", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      } else {
        await channel.send(
          t(lang, "daySlayDemonDies", { target: target.displayName }),
        );
        notifyStoryteller(
          ctx.client,
          state,
          t(lang, "daySlayDemonStLog", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
        const gameEnded = await killPlayerDuringDay(
          ctx.client,
          state,
          channel,
          target.userId,
        );
        if (!gameEnded) {
          if (daySession.activeNomination?.nomineeId === target.userId) {
            await cancelActiveNomination(
              ctx.client,
              state,
              channel,
              target.userId,
            );
          }
        }
      }
    } else {
      // Not the Demon → nothing happens
      if (state.mode === "manual") {
        daySession.pendingSlayFixed = {
          slayerId: i.user.id,
          targetId: target.userId,
          outcome: "nothing",
        };
        updateGame(state);
        await channel.send(t(lang, "daySlayPending"));
        const stLang = state.storytellerId ? getLang(state.storytellerId) : lang;
        notifyStoryteller(
          ctx.client,
          state,
          t(stLang, "daySlayNotDemonStNotify", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      } else {
        await channel.send(t(lang, "dayNothingHappens"));
        notifyStoryteller(
          ctx.client,
          state,
          t(lang, "daySlayNotDemonStLog", {
            slayer: player.displayName,
            target: target.displayName,
          }),
        );
      }
    }
  },
};

async function handleStorytellerDm(
  message: Message,
  ctx: DayGameCtx,
): Promise<boolean> {
  const { state, client } = ctx;
  const runtime = state.runtime;
  const daySession = runtime.daySession;
  if (!daySession || daySession.status !== "open") return false;

  const stLang = getLang(message.author.id);
  const content = message.content.trim().toUpperCase();
  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;
  const lang = channelLang(state);

  // SLAY CONFIRM — broadcast the fixed outcome for Scenarios 1-3 in manual mode
  if (content === "SLAY CONFIRM") {
    const pending = daySession.pendingSlayFixed;
    if (!pending) {
      await message.reply(t(stLang, "daySlayNoPending"));
      return true;
    }

    const slayerName = playerDisplayName(state, pending.slayerId);
    const targetName = playerDisplayName(state, pending.targetId);

    daySession.pendingSlayFixed = null;
    updateGame(state);

    await message.reply(
      pending.outcome === "kill"
        ? t(stLang, "daySlayConfirmedKill")
        : t(stLang, "daySlayConfirmedNothing"),
    );

    if (pending.outcome === "kill") {
      await channel.send(
        t(lang, "daySlayConfirmKillAnnounce", {
          target: targetName,
          slayer: slayerName,
        }),
      );
      const gameEnded = await killPlayerDuringDay(
        client,
        state,
        channel,
        pending.targetId,
      );
      if (
        !gameEnded &&
        daySession.activeNomination?.nomineeId === pending.targetId
      ) {
        await cancelActiveNomination(client, state, channel, pending.targetId);
      }
    } else {
      await channel.send(t(lang, "dayNothingHappens"));
    }
    return true;
  }

  // SLAY KILL / SLAY NOTHING — resolve pending Recluse slay in manual mode
  if (content === "SLAY KILL" || content === "SLAY NOTHING") {
    const pending = daySession.pendingSlayRecluse;
    if (!pending) {
      await message.reply(t(stLang, "daySlayRecluseNoPending"));
      return true;
    }

    const kill = content === "SLAY KILL";
    daySession.pendingSlayRecluse = null;
    updateGame(state);

    const slayerName = playerDisplayName(state, pending.slayerId);
    const targetName = playerDisplayName(state, pending.targetId);

    await message.reply(
      kill
        ? t(stLang, "daySlayConfirmedKill")
        : t(stLang, "daySlayConfirmedNothing"),
    );

    if (kill) {
      await channel.send(
        t(lang, "daySlayConfirmKillAnnounce", {
          target: targetName,
          slayer: slayerName,
        }),
      );
      const gameEnded = await killPlayerDuringDay(
        client,
        state,
        channel,
        pending.targetId,
      );
      if (
        !gameEnded &&
        daySession.activeNomination?.nomineeId === pending.targetId
      ) {
        await cancelActiveNomination(client, state, channel, pending.targetId);
      }
    } else {
      await channel.send(t(lang, "daySlayRecluseNothing"));
    }
    return true;
  }

  return false;
}

export const definition: RoleDefinition = {
  id: "slayer",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  commands: [slayCommand],
  handleStorytellerDm,
};
