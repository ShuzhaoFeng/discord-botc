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
  | "awaiting_storyteller_action"
  | "awaiting_players"
  | "awaiting_storyteller_info"
  | "completed";

export interface InputSpec {
  type: "player"; // extensible union for future input types
  optional: boolean;
  allowSelf: boolean; // enforced per-slot during validation
}

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

export type PlayerTag =
  | "poisoned" // set by Poisoner; cleared at start of next night
  | "protected" // set by Monk; cleared at start of next night
  | "ghost_vote_used" // set when dead player uses ghost vote; permanent
  | "red_herring" // set at runtime initialization; permanent
  | "slayer_used" // set when Slayer ability is consumed; permanent
  | "butler_master"; // set by Butler's resolve; transferred each night

export interface PlayerRuntimeState {
  player: Player;
  role: Role; // true assigned role
  effectiveRole: Role; // Drunk → fake Townsfolk role; everyone else → same as role
  alive: boolean;
  tags: Set<PlayerTag>;
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
  kind: "action" | "info" | "joke";
  inputs: InputSpec[]; // non-empty only when kind === "action"
  ackToken?: string; // only when kind === "info"
}

export interface NightOutcomeMeta {
  kind: "randomized" | "fixed";
  reasonKey?: string;
  reasonParams?: Record<string, string | number>;
}

export type NightOutcomeTemplateId =
  | "pair_role_info"
  | "empath_count"
  | "chef_count"
  | "fortune_result"
  | "undertaker_role"
  | "grimoire";

export type NightOutcomeFieldType = "player" | "role" | "number" | "boolean";

export type NightOutcomeFieldValue = string | number | boolean;

export type NightOutcomeConstraintValue = string | number | boolean;

export interface NightOutcomeDraft {
  templateId: NightOutcomeTemplateId;
  fields: Record<string, NightOutcomeFieldValue>;
  fieldTypes: Record<string, NightOutcomeFieldType>;
  constraints?: Record<string, NightOutcomeConstraintValue>;
  allowArbitraryOverride?: boolean;
  reasonKey?: string; // fixed-case reason for storyteller display; core overrides when randomized
}

export interface NightSession {
  nightNumber: number;
  status: NightSessionStatus;
  prompts: Map<string, NightPrompt>;
  actionMessages: Map<string, string>;
  responses: Map<string, (string | null)[]>;
  pendingPlayerIds: string[];
  actionPreview?: string;
  infoPreview?: string;
  infoMessages: Map<string, string>;
  infoOutcomeMeta: Map<string, NightOutcomeMeta>;
  infoOutcomeDrafts: Map<string, NightOutcomeDraft>;
}

export interface RuntimeState {
  nightNumber: number;
  playerStates: PlayerRuntimeState[]; // in seating order, same order as state.players
  nightSession: NightSession | null;
  daySession: DaySession | null;
  lastExecutedPlayerId: string | null;
  nightKillIds: string[]; // kills from last night, consumed at day start
  nightKillIntentId: string | null; // set by Imp's resolve; consumed by core kill resolution; reset each night
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
