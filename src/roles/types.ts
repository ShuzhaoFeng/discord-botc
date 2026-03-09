export interface LocalizedString {
  en: string;
  zh: string;
}

import type {
  InputSpec,
  Lang,
  NightOutcomeDraft,
  Player,
  Role,
  RuntimeState,
} from "../game/types";

export interface NightCtx {
  runtime: RuntimeState;
  player: Player;
  nightNumber: number;
  responses: Map<string, (string | null)[]>; // session responses, available during info compute
  lang: Lang;
  // Pre-computed by the core as: ps.role.id === "drunk" || ps.tags.has("poisoned").
  // Info handlers should randomize output when true.
  randomizeInfo: boolean;
  // All roles in the current script; use for picking random role names in false info.
  scriptRoles: readonly Role[];
}

export interface NightActionHandler {
  active: (n: number) => boolean;
  buildPrompt: (ctx: NightCtx) => InputSpec[];
  // Handlers must NOT apply lethality directly — only write tags or runtime.nightKillIntentId.
  // values is always inputs.length long; optional slots not filled by the player are null.
  resolve: (ctx: NightCtx, values: (string | null)[]) => void;
}

export interface NightInfoHandler {
  active: (n: number) => boolean;
  // Returns null when there is a determinate "no result" (e.g. Undertaker with no execution).
  compute: (ctx: NightCtx) => NightOutcomeDraft | null;
  // i18n keys used when compute returns null; default to "nightNoExecution" / "nightReasonNoExecution".
  nullMsgKey?: string;
  nullReasonKey?: string;
}

export interface RoleNightHandlers {
  action?: NightActionHandler;
  info?: NightInfoHandler;
}

export interface RoleDefinition {
  id: string;
  name: LocalizedString;
  guide: LocalizedString;
  nightHandlers?: RoleNightHandlers;
}

export const Night = {
  firstOnly: (n: number) => n === 1,
  afterFirst: (n: number) => n > 1,
  always: (_: number) => true,
};
