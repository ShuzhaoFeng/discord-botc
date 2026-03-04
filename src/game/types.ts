export type Lang = "en" | "zh";

/** Prefix for all fake test-player userIds. The UUID segment lets us reliably
 *  distinguish bot-generated fake IDs from any real Discord snowflake or name. */
export const FAKE_PLAYER_ID_PREFIX = "fake_7d3f9c2a_";
export type RoleCategory = "Townsfolk" | "Outsider" | "Minion" | "Demon";
export type GameMode = "automated" | "manual" | "pending";
export type GamePhase =
  | "pending_storyteller"
  | "role_assignment"
  | "in_progress"
  | "ended";
export type NightSessionStatus =
  | "awaiting_storyteller_step1"
  | "awaiting_players"
  | "awaiting_storyteller_step3"
  | "completed";

export type NightPromptExpected =
  | "ack"
  | "single_player"
  | "double_player"
  | "free_text";

export interface Role {
  id: string;
  category: RoleCategory;
}

export interface Player {
  userId: string;
  username: string;
  displayName: string;
  seatIndex: number; // 0-based, determines circular seating order
  isTestPlayer?: boolean; // true for synthetic fake players in test mode
}

export interface Draft {
  assignments: Map<string, Role>; // userId -> role (true role)
  drunkFakeRole: Role | null; // Drunk's fake Townsfolk role
  redHerring: string | null; // userId of Fortune Teller's red herring
  impBluffs: [Role, Role, Role] | null;
}

export interface PlayerRuntimeState {
  alive: boolean;
  poisoned: boolean;
  butlerMasterId: string | null;
  protectedTonight: boolean;
  ghostVoteUsed: boolean; // dead players' one-time ghost vote
}

export interface NominationRecord {
  nominatorId: string;
  nomineeId: string;
  votes: Set<string>; // userIds who cast /ye (includes nominator's auto-vote)
  finalVoteCount: number; // resolved vote count after Butler adjustment
  aliveThenCount: number; // alive count when window closed
  windowClosedAt: number; // timestamp
  status: "active" | "completed" | "cancelled";
}

export interface PendingSlayRecluse {
  slayerId: string;
  targetId: string; // Recluse's userId
  proposedKill: boolean; // bot's random proposal: true = kill Recluse
}

export interface PendingSlayFixed {
  slayerId: string;
  targetId: string;
  outcome: "nothing" | "kill"; // fixed outcome, storyteller must confirm via SLAY CONFIRM
}

export interface DaySession {
  dayNumber: number;
  nominatorIds: Set<string>; // players who have nominated today
  nomineeIds: Set<string>; // players who have been nominated today
  nominations: NominationRecord[];
  activeNomination: NominationRecord | null;
  endDayVotes: Set<string>; // alive players who used /endday
  endDayThresholdMet: boolean; // majority /endday reached
  dayEndsAfterNomination: boolean; // any end condition triggered; wait for active window to close
  status: "open" | "ended";
  nightKillIds: string[]; // players who died last night (announced at day start)
  pendingSlayRecluse: PendingSlayRecluse | null; // manual mode pending Recluse slay (Scenario 4)
  pendingSlayFixed: PendingSlayFixed | null; // manual mode pending confirmation for Scenarios 1-3
}

export interface NightPrompt {
  playerId: string;
  effectiveRoleId: string;
  expected: NightPromptExpected;
  ackToken?: string;
  minChoices?: number;
  maxChoices?: number;
  allowSelf?: boolean;
}

export interface NightOutcomeMeta {
  kind: "randomized" | "fixed";
  reasonEn?: string;
  reasonZh?: string;
}

export type NightOutcomeTemplateId =
  | "pair_role_info"
  | "empath_count"
  | "chef_count"
  | "fortune_result"
  | "undertaker_role";

export type NightOutcomeFieldType = "player" | "role" | "number" | "boolean";

export type NightOutcomeFieldValue = string | number | boolean;

export type NightOutcomeConstraintValue = string | number | boolean;

export interface NightOutcomeDraft {
  templateId: NightOutcomeTemplateId;
  fields: Record<string, NightOutcomeFieldValue>;
  fieldTypes: Record<string, NightOutcomeFieldType>;
  constraints?: Record<string, NightOutcomeConstraintValue>;
  allowArbitraryOverride?: boolean;
}

export interface NightSession {
  nightNumber: number;
  status: NightSessionStatus;
  prompts: Map<string, NightPrompt>;
  step1Messages: Map<string, string>;
  responses: Map<string, string[]>;
  pendingPlayerIds: string[];
  step1Preview?: string;
  step3Preview?: string;
  step3Messages: Map<string, string>;
  step3OutcomeMeta: Map<string, NightOutcomeMeta>;
  step3OutcomeDrafts: Map<string, NightOutcomeDraft>;
}

export interface RuntimeState {
  nightNumber: number;
  playerStates: Map<string, PlayerRuntimeState>;
  nightSession: NightSession | null;
  daySession: DaySession | null;
  lastExecutedPlayerId: string | null;
  nightKillIds: string[]; // kills from last night, consumed at day start
  slayerHasUsed: boolean; // Slayer's once-per-game ability has been consumed
}

export interface GameState {
  gameId: string; // e.g. "clocktower-42"
  gameNumber: number;
  guildId: string;
  channelId: string;
  players: Player[]; // in seating order (excludes storyteller)
  storytellerId: string | null; // null = automated mode
  mode: GameMode;
  phase: GamePhase;
  draft: Draft | null; // active during role_assignment phase
  runtime: RuntimeState | null;
  testMode?: boolean; // true when started via !ctest
  testOwnerId?: string; // receives all redirected DMs for fake players
}
