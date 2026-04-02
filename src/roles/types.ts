export interface LocalizedString {
  en: string;
  zh: string;
}

import type {
  ActiveGameState,
  InputSpec,
  Lang,
  NightOutcomeDraft,
  Player,
  Role,
} from "../game/types";
import {
  Client,
  Message,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

/** Fields specific to a night-phase handler invocation. */
export interface NightPhaseCtx {
  player: Player;
  nightNumber: number;
  responses: Map<string, (string | null)[]>;
  lang: Lang;
  scriptRoles: readonly Role[];
}

/** Fields specific to a day-phase handler invocation. Reserved; currently empty. */
export interface DayPhaseCtx {
  // Reserved for future day-specific fields.
}

/**
 * Unified handler context. Always carries a game-in-progress state and client.
 * Exactly one of `night` or `day` is populated depending on when the handler
 * is invoked. Prefer the narrowed aliases NightGameCtx / DayGameCtx when the
 * phase is known at the call site.
 */
export interface GameCtx {
  state: ActiveGameState;
  client: Client;
  night?: NightPhaseCtx;
  day?: DayPhaseCtx;
}

/** Context for night-phase handlers — `night` is always present. */
export type NightGameCtx = GameCtx & { night: NightPhaseCtx };

/** Context for day-phase commands and storyteller DM handlers — `day` is always present. */
export type DayGameCtx = GameCtx & { day: DayPhaseCtx };

export interface NightActionHandler {
  active: (n: number) => boolean;
  buildPrompt: (ctx: NightGameCtx) => InputSpec[];
  // Handlers must NOT apply lethality directly — only write tags or runtime.nightKillIntentId.
  // values is always inputs.length long; optional slots not filled by the player are null.
  resolve: (ctx: NightGameCtx, values: (string | null)[]) => void;
}

export interface NightInfoHandler {
  active: (n: number) => boolean;
  // Returns null when there is a determinate "no result" (e.g. Undertaker with no execution).
  compute: (ctx: NightGameCtx) => NightOutcomeDraft | null;
  // i18n keys used when compute returns null; default to "nightNoExecution" / "nightReasonNoExecution".
  nullMsgKey?: string;
  nullReasonKey?: string;
}

export interface RoleNightHandlers {
  action?: NightActionHandler;
  info?: NightInfoHandler;
}

export type CommandPhase = "day" | "night" | "any";
export type CommandChannel = "public" | "dm" | "any";

export interface RoleCommandDefinition {
  /** Discord slash command name (e.g. "slay"). */
  name: string;
  /**
   * Receives a fresh builder pre-seeded with `name`; add description, options,
   * etc. Return the same builder — all builder methods are chainable and return
   * `this`. Do NOT call setName() again.
   */
  configure: (b: SlashCommandBuilder) => SlashCommandBuilder;
  /** Game phase in which the command is accepted. */
  allowedPhase: CommandPhase;
  /** Channel context in which the command is accepted. */
  allowedChannel: CommandChannel;
  /**
   * Business logic. The core guarantees:
   *   - channel context matches allowedChannel
   *   - an active game exists for the channel
   *   - game phase matches allowedPhase
   * Role-specific checks (player is registered, player is alive, target is
   * valid, etc.) are still the responsibility of execute.
   * ctx carries pre-fetched state and runtime to avoid a redundant lookup.
   */
  execute: (i: ChatInputCommandInteraction, ctx: DayGameCtx) => Promise<void>;
}

export interface RoleDefinition {
  id: string;
  name: LocalizedString;
  guide: LocalizedString;
  nightHandlers?: RoleNightHandlers;
  commands?: RoleCommandDefinition[];
  /**
   * Storyteller DM handler for role-specific pending → confirm patterns
   * (e.g. SLAY CONFIRM / SLAY KILL / SLAY NOTHING).
   * Return true if the message was consumed.
   */
  handleStorytellerDm?: (message: Message, ctx: DayGameCtx) => Promise<boolean>;
}

export const Night = {
  firstOnly: (n: number) => n === 1,
  afterFirst: (n: number) => n > 1,
  always: (_: number) => true,
};
