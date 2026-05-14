import type {
  RoleDefinition,
  RoleCommandDefinition,
  DayGameCtx,
} from "../types";
import {
  SlashCommandBuilder,
  Message,
  ChatInputCommandInteraction,
  TextChannel,
} from "discord.js";
import type { Player, SlayOutcome } from "../../game/types";
import { useTranslation, t } from "../../i18n";
import {
  getPlayerState,
  getRole,
  resolvePlayer,
  channelLang,
} from "../../game/utils";
import { updateGame } from "../../game/state";
import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

type Translator = ReturnType<typeof useTranslation>;

// ─── Scenario table ──────────────────────────────────────────────────────────
// Five "fixed" scenarios share a resolver and differ only in i18n keys; the
// Recluse case is a coin-flip the storyteller may override.

interface FixedScenario {
  outcome: SlayOutcome;
  /** Storyteller DM key used in manual mode (pending notification). */
  stNotifyKey: string;
  /** Storyteller DM key used in automated mode (after-the-fact log). */
  stLogKey: string;
  /** Channel announcement key used in automated mode. */
  autoChannelKey: string;
  /** When true, automated channel announcement receives a `target` param. */
  autoChannelIncludesTarget?: boolean;
}

type FixedScenarioId = "bluff" | "poisoned" | "used" | "demonKill" | "notDemon";

const FIXED_SCENARIOS: Record<FixedScenarioId, FixedScenario> = {
  bluff: {
    outcome: "nothing",
    stNotifyKey: "daySlayBluffStNotify",
    stLogKey: "daySlayBluffStLog",
    autoChannelKey: "dayNothingHappens",
  },
  poisoned: {
    outcome: "nothing",
    stNotifyKey: "daySlayPoisonedStNotify",
    stLogKey: "daySlayPoisonedStLog",
    autoChannelKey: "dayNothingHappens",
  },
  used: {
    outcome: "nothing",
    stNotifyKey: "daySlayUsedStNotify",
    stLogKey: "daySlayUsedStLog",
    autoChannelKey: "dayNothingHappens",
  },
  demonKill: {
    outcome: "kill",
    stNotifyKey: "daySlayDemonStNotify",
    stLogKey: "daySlayDemonStLog",
    autoChannelKey: "daySlayDemonDies",
    autoChannelIncludesTarget: true,
  },
  notDemon: {
    outcome: "nothing",
    stNotifyKey: "daySlayNotDemonStNotify",
    stLogKey: "daySlayNotDemonStLog",
    autoChannelKey: "dayNothingHappens",
  },
};

// ─── Resolvers ───────────────────────────────────────────────────────────────

/** ST translator with a fallback to the slayer's translator in automated mode. */
function storytellerTranslator(
  ctx: DayGameCtx,
  fallback: Translator,
): Translator {
  return ctx.state.storytellerId
    ? useTranslation(ctx.state.storytellerId, ctx.state.guildId)
    : fallback;
}

/**
 * Apply a kill from a confirmed slay and cancel the target's active nomination
 * if any. Returns true if the game ended.
 */
async function applySlayKill(
  ctx: DayGameCtx,
  channel: TextChannel,
  targetId: string,
): Promise<boolean> {
  const daySession = ctx.state.runtime.daySession!;
  const gameEnded = await ctx.day.killPlayer(channel, targetId);
  if (!gameEnded && daySession.activeNomination?.nomineeId === targetId) {
    await ctx.day.cancelActiveNomination(channel, targetId);
  }
  return gameEnded;
}

async function resolveFixedSlay(
  ctx: DayGameCtx,
  channel: TextChannel,
  scenario: FixedScenario,
  slayer: Player,
  target: Player,
  tr: Translator,
): Promise<void> {
  const { state } = ctx;
  const daySession = state.runtime.daySession!;
  const nameParams = { slayer: slayer.displayName, target: target.displayName };

  if (state.mode === "manual") {
    daySession.pendingSlayFixed = {
      slayerId: slayer.userId,
      targetId: target.userId,
      outcome: scenario.outcome,
    };
    updateGame(state);
    await channel.send(tr("daySlayPending"));
    const trSt = storytellerTranslator(ctx, tr);
    ctx.notifyStoryteller(trSt(scenario.stNotifyKey, nameParams));
    return;
  }

  // Automated: notifyStoryteller is a no-op when there's no human storyteller.
  const channelMsg = scenario.autoChannelIncludesTarget
    ? tr(scenario.autoChannelKey, { target: target.displayName })
    : tr(scenario.autoChannelKey);
  await channel.send(channelMsg);
  ctx.notifyStoryteller(tr(scenario.stLogKey, nameParams));

  if (scenario.outcome === "kill") {
    await applySlayKill(ctx, channel, target.userId);
  }
}

async function resolveRecluseSlay(
  ctx: DayGameCtx,
  channel: TextChannel,
  slayer: Player,
  target: Player,
  tr: Translator,
): Promise<void> {
  const { state } = ctx;
  const daySession = state.runtime.daySession!;
  const proposedKill = Math.random() < 0.5;

  if (state.mode === "automated") {
    if (proposedKill) {
      await channel.send(
        tr("daySlayRecluseKill", { target: target.displayName }),
      );
      await applySlayKill(ctx, channel, target.userId);
    } else {
      await channel.send(tr("daySlayRecluseNothing"));
    }
    return;
  }

  // Manual: storyteller decides via SLAY KILL / SLAY NOTHING DM.
  daySession.pendingSlayRecluse = {
    slayerId: slayer.userId,
    targetId: target.userId,
    proposedKill,
  };
  updateGame(state);
  await channel.send(tr("daySlayPending"));

  const trSt = storytellerTranslator(ctx, tr);
  const proposal = proposedKill
    ? trSt("daySlayRecluseProposalKill")
    : trSt("daySlayRecluseProposalNothing");
  ctx.notifyStoryteller(
    trSt("daySlayRecluseStNotify", {
      slayer: slayer.displayName,
      target: target.displayName,
      proposal,
    }),
  );
}

async function broadcastSlayConfirmation(
  ctx: DayGameCtx,
  channel: TextChannel,
  lang: "en" | "zh",
  kill: boolean,
  slayerId: string,
  targetId: string,
  /** Used for the Recluse-nothing case which has its own channel string. */
  nothingKey: "dayNothingHappens" | "daySlayRecluseNothing",
): Promise<void> {
  if (kill) {
    await channel.send(
      t(lang, "daySlayConfirmKillAnnounce", {
        target: ctx.playerDisplayName(targetId),
        slayer: ctx.playerDisplayName(slayerId),
      }),
    );
    await applySlayKill(ctx, channel, targetId);
  } else {
    await channel.send(t(lang, nothingKey));
  }
}

// ─── /slay command ───────────────────────────────────────────────────────────

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
    const tr = useTranslation(i.user.id, state.guildId);

    // Storyteller cannot use /slay
    if (state.storytellerId === i.user.id) {
      await i.reply({
        content: tr("dayStorytellerCannotSlay"),
        ephemeral: true,
      });
      return;
    }

    const player = state.players.find((p) => p.userId === i.user.id);
    if (!player) {
      await i.reply({ content: tr("dayNotAPlayer"), ephemeral: true });
      return;
    }

    const daySession = runtime.daySession;
    if (!daySession || daySession.status !== "open") {
      await i.reply({ content: tr("dayNotDaytime"), ephemeral: true });
      return;
    }

    const playerState = getPlayerState(runtime, i.user.id);
    if (!playerState?.alive) {
      await i.reply({ content: tr("dayDeadCannotSlay"), ephemeral: true });
      return;
    }

    const targetInput = i.options.getString("player", true);
    const target = resolvePlayer(targetInput, state.players);
    if (!target) {
      await i.reply({
        content: tr("dayUnknownPlayer", { player: targetInput }),
        ephemeral: true,
      });
      return;
    }

    const targetState = getPlayerState(runtime, target.userId);
    if (!targetState?.alive) {
      await i.reply({
        content: tr("daySlayTargetDead", { player: target.displayName }),
        ephemeral: true,
      });
      return;
    }

    const realRole = getRole(runtime, i.user.id);
    const targetRole = getRole(runtime, target.userId);
    const isRealSlayer = realRole.id === "slayer";
    const slayerPoisoned = playerState.tags.has("poisoned");
    const alreadyUsed = playerState.tags.has("slayer_used");

    const scenario: FixedScenarioId | "recluse" = !isRealSlayer
      ? "bluff"
      : slayerPoisoned
        ? "poisoned"
        : alreadyUsed
          ? "used"
          : targetRole.id === "recluse"
            ? "recluse"
            : targetRole.id === "imp"
              ? "demonKill"
              : "notDemon";

    const channel = (await ctx.client.channels.fetch(
      state.channelId,
    )) as TextChannel;
    await i.reply(
      tr("daySlayAnnounce", {
        slayer: player.displayName,
        target: target.displayName,
      }),
    );

    // The ability is consumed only when a real, sober, unused Slayer slays.
    if (
      scenario === "recluse" ||
      scenario === "demonKill" ||
      scenario === "notDemon"
    ) {
      playerState.tags.add("slayer_used");
      updateGame(state);
    }

    if (scenario === "recluse") {
      await resolveRecluseSlay(ctx, channel, player, target, tr);
    } else {
      await resolveFixedSlay(
        ctx,
        channel,
        FIXED_SCENARIOS[scenario],
        player,
        target,
        tr,
      );
    }
  },
};

// ─── Storyteller DM (SLAY CONFIRM / SLAY KILL / SLAY NOTHING) ────────────────

async function handleStorytellerDM(
  message: Message,
  ctx: DayGameCtx,
): Promise<boolean> {
  const { state, client } = ctx;
  const runtime = state.runtime;
  const daySession = runtime.daySession;
  if (!daySession || daySession.status !== "open") return false;

  const trSt = useTranslation(message.author.id, state.guildId);
  const content = message.content.trim().toUpperCase();
  const channel = (await client.channels.fetch(state.channelId)) as TextChannel;
  const lang = channelLang(state);

  if (content === "SLAY CONFIRM") {
    const pending = daySession.pendingSlayFixed;
    if (!pending) {
      await message.reply(trSt("daySlayNoPending"));
      return true;
    }
    daySession.pendingSlayFixed = null;
    updateGame(state);

    const kill = pending.outcome === "kill";
    await message.reply(
      kill ? trSt("daySlayConfirmedKill") : trSt("daySlayConfirmedNothing"),
    );
    await broadcastSlayConfirmation(
      ctx,
      channel,
      lang,
      kill,
      pending.slayerId,
      pending.targetId,
      "dayNothingHappens",
    );
    return true;
  }

  if (content === "SLAY KILL" || content === "SLAY NOTHING") {
    const pending = daySession.pendingSlayRecluse;
    if (!pending) {
      await message.reply(trSt("daySlayRecluseNoPending"));
      return true;
    }
    daySession.pendingSlayRecluse = null;
    updateGame(state);

    const kill = content === "SLAY KILL";
    await message.reply(
      kill ? trSt("daySlayConfirmedKill") : trSt("daySlayConfirmedNothing"),
    );
    await broadcastSlayConfirmation(
      ctx,
      channel,
      lang,
      kill,
      pending.slayerId,
      pending.targetId,
      "daySlayRecluseNothing",
    );
    return true;
  }

  return false;
}

export const definition: RoleDefinition = {
  id: "slayer",
  name: { en: en.name, zh: zh.name },
  guide: { en: en.guide, zh: zh.guide },
  commands: [slayCommand],
  handleStorytellerDM,
};
