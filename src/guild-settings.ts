import { Lang } from "./game/types";

/** Per-guild settings bag. All guild-level prefs live here. */
export interface GuildSettings {
  defaultLang: Lang;
  drunkOverlap: boolean;
  /** When set, the confirm flow pauses to show a clocktower-compatible JSON export. */
  townsquareUrl: string | null;
}

const DEFAULT_GUILD_SETTINGS: GuildSettings = {
  defaultLang: "en",
  drunkOverlap: false,
  townsquareUrl: null,
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

export function getGuildDrunkOverlap(guildId: string): boolean {
  return resolve(guildId).drunkOverlap;
}

export function setGuildDrunkOverlap(guildId: string, allowed: boolean): void {
  updateGuildSettings(guildId, { drunkOverlap: allowed });
}
