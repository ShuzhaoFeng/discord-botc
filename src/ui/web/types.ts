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

export interface NightDetail {
  channelId: string;
  gameId: string;
  phase: Extract<GamePhase, "in_progress" | "ended">;
  nightNumber: number;
  nightStatus: string | null;
  players: NightPlayerInfo[];
  conversations: Record<string, ChatMessage[]>;
}

export interface DraftUpdateResponse {
  draft: DraftState;
  validationError: ValidationError | null;
}
