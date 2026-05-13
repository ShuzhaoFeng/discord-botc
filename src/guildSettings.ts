import { Lang } from "./game/types";

/** Per-guild settings bag. All guild-level prefs live here. */
export interface GuildSettings {
  defaultLang: Lang;
  /** When set, the confirm flow pauses to show a clocktower-compatible JSON export. */
  townsquareUrl: string | null;
  /** When true, skips filler night messages (jokes, readiness confirmations) for online play. */
  onlineMode: boolean;
}

const DEFAULT_GUILD_SETTINGS: GuildSettings = {
  defaultLang: "en",
  townsquareUrl: null,
  onlineMode: false,
};

const guildSettingsMap = new Map<string, GuildSettings>();

function resolve(guildId: string): GuildSettings {
  return guildSettingsMap.get(guildId) ?? DEFAULT_GUILD_SETTINGS;
}

export function getGuildSettings(guildId: string): GuildSettings {
  return resolve(guildId);
}

export function updateGuildSettings(
  guildId: string,
  patch: Partial<GuildSettings>,
): GuildSettings {
  const current = resolve(guildId);
  const updated = { ...current, ...patch };
  guildSettingsMap.set(guildId, updated);
  return updated;
}

// ── Convenience accessors (used widely in game logic) ────────────────────────

export function getGuildDefaultLang(guildId: string): Lang {
  return resolve(guildId).defaultLang;
}

export function setGuildDefaultLang(guildId: string, lang: Lang): void {
  updateGuildSettings(guildId, { defaultLang: lang });
}
