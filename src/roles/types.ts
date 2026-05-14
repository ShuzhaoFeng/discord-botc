import type {
  ActiveGameState,
  InputSpec,
  Lang,
  NightOutcomeDraft,
  Player,
  Role,
  WinCheckTrigger,
  WinVerdict,
} from "../game/types";

export type LocalizedString = Partial<Record<Lang, string>>;
import {
  Client,
  Message,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
} from "discord.js";

/** Fields specific to a night-phase handler invocation. */
export interface NightPhaseCtx {
  player: Player;
  nightNumber: number;
  responses: Map<string, (string | null)[]>;
  lang: Lang;
  scriptRoles: readonly Role[];
}

/** Fields specific to a day-phase handler invocation. */
export interface DayPhaseCtx {
  /** Returns true iff the game synchronously ended (automated mode + win condition). */
  killPlayer: (
    channel: TextChannel,
    playerId: string,
    byExecution?: boolean,
  ) => Promise<boolean>;
  cancelActiveNomination: (
    channel: TextChannel,
    killedPlayerId: string,
  ) => Promise<void>;
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
  playerDisplayName: (userId: string) => string;
  notifyStoryteller: (content: string) => void;
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

/** Context passed to every death handler when any player dies. */
export interface DeathCtx {
  state: ActiveGameState;
  client: Client;
  /** The userId of the player who just died. */
  deadPlayerId: string;
  /** Which game phase the death occurred in. */
  phase: "day" | "night";
  /** True only for deaths caused by execution (daytime vote or Virgin trigger). */
  byExecution: boolean;
}

/**
 * Optional per-role hook invoked whenever ANY player dies.
 * The handler is responsible for checking whether the death is relevant to it.
 */
export interface RoleDeathHandler {
  onDeath: (ctx: DeathCtx) => Promise<void>;
}

export interface WinConditionCtx {
  state: ActiveGameState;
  trigger: WinCheckTrigger;
  lang: Lang;
}

/**
 * Optional per-role win-condition check. Role handlers run before the
 * generic checks; the first non-null verdict wins. Order between role
 * handlers is unspecified — if two role conditions could ever fire on the
 * same trigger, introduce explicit tie-breaking before adding the second.
 */
export interface RoleWinConditionHandler {
  evaluate: (ctx: WinConditionCtx) => WinVerdict | null;
}

export interface RoleDefinition {
  id: string;
  name: LocalizedString;
  guide: LocalizedString;
  nightHandlers?: RoleNightHandlers;
  commands?: RoleCommandDefinition[];
  /** Called whenever any player dies; handler decides internally if it cares. */
  deathHandler?: RoleDeathHandler;
  /** Optional role-specific win condition; iterated by `evaluateWinCondition`. */
  winConditionHandler?: RoleWinConditionHandler;
  /**
   * Storyteller DM handler for role-specific pending → confirm patterns
   * (e.g. SLAY CONFIRM / SLAY KILL / SLAY NOTHING).
   * Return true if the message was consumed.
   */
  handleStorytellerDM?: (message: Message, ctx: DayGameCtx) => Promise<boolean>;
}

export const Night = {
  firstOnly: (n: number) => n === 1,
  afterFirst: (n: number) => n > 1,
  always: (_: number) => true,
};
