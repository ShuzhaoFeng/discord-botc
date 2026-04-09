import type {
  GamePhase,
  NightPromptKind,
  RoleCategory,
} from "../../game/types";

export interface RoleInfo {
  id: string;
  category: RoleCategory;
  name: string;
}

export interface PlayerAssignment {
  userId: string;
  displayName: string;
  seatIndex: number;
  role: RoleInfo;
}

export interface DraftState {
  assignments: PlayerAssignment[];
  drunkFakeRole: RoleInfo | null;
  redHerring: string | null;
  impBluffs: [RoleInfo, RoleInfo, RoleInfo] | null;
}

export interface ValidationError {
  key: string;
  params?: Record<string, string | number>;
}

export interface GameDetail {
  channelId: string;
  gameId: string;
  draft: DraftState;
  allRoles: RoleInfo[];
  validationError: ValidationError | null;
  townsquareUrl: string | null;
}

export interface GameSummary {
  channelId: string;
  gameId: string;
  phase: Extract<GamePhase, "role_assignment" | "in_progress">;
  playerCount: number;
}

export interface ChatMessage {
  from: "bot" | string; // "bot" or playerId
  text: string;
  timestamp: number;
}

export interface NightPlayerInfo {
  userId: string;
  displayName: string;
  roleId: string;
  alive: boolean;
  pending: boolean;
  promptKind: NightPromptKind | null;
}

export interface NightMessageDraft {
  templateId: string;
  fields: Record<string, string | number | boolean>;
  fieldTypes: Record<string, "player" | "role" | "number" | "boolean">;
  constraints?: Record<string, string | number | boolean>;
  allowArbitraryOverride?: boolean;
}

export interface NightActionEntry {
  userId: string;
  displayName: string;
  message: string;
}

export interface NightInfoEntry {
  userId: string;
  displayName: string;
  message: string;
  metaKind: "randomized" | "fixed";
  reasonKey?: string;
  draft?: NightMessageDraft;
}

export interface PlayerBasic {
  userId: string;
  displayName: string;
}

export interface RoleBasic {
  id: string;
  name: string;
}

export interface NightDeathConfirmEntry {
  userId: string;
  displayName: string;
  kind: "simple" | "ravenkeeper";
  response: string;
  confirmation: string;
  draft?: {
    fields: Record<string, string>;
    fieldTypes: Record<string, "role" | "player">;
  };
}

export interface NightDetail {
  channelId: string;
  gameId: string;
  phase: Extract<GamePhase, "in_progress" | "ended">;
  nightNumber: number;
  nightStatus: string | null;
  players: NightPlayerInfo[];
  conversations: Record<string, ChatMessage[]>;
  // Control panel data
  actionMessages?: NightActionEntry[];
  infoMessages?: NightInfoEntry[];
  deathConfirmEntries?: NightDeathConfirmEntry[];
  allPlayers?: PlayerBasic[];
  scriptRoles?: RoleBasic[];
}

export interface DraftUpdateResponse {
  draft: DraftState;
  validationError: ValidationError | null;
}

export interface ConfirmResponse {
  ok: true;
  clocktowerJson: object;
}

export interface GuildSettingsData {
  defaultLang: "en" | "zh";
  drunkOverlap: boolean;
  townsquareUrl: string | null;
  onlineMode: boolean;
}

export interface GuildSettingsEntry {
  guildId: string;
  guildName: string;
  settings: GuildSettingsData;
}

export interface GuildSettingsResponse {
  guilds: GuildSettingsEntry[];
}
