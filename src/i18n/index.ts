import enStrings from "./en.json";
import zhStrings from "./zh.json";
import { Lang } from "../game/types";
import { ALL_ROLE_DEFINITIONS } from "../roles";
import { getGuildDefaultLang } from "../guild-settings";

const strings: Record<Lang, Record<string, string>> = {
  en: enStrings as Record<string, string>,
  zh: zhStrings as Record<string, string>,
};

const roleDefById = new Map(ALL_ROLE_DEFINITIONS.map((r) => [r.id, r]));

/** Per-user language preferences (lives for bot session lifetime). */
const userLang = new Map<string, Lang>();

export function getLang(userId: string, guildId?: string | null): Lang {
  const userSetting = userLang.get(userId);
  if (userSetting) return userSetting;

  if (guildId) {
    return getGuildDefaultLang(guildId);
  }

  return "en";
}

export function setLang(userId: string, lang: Lang): void {
  userLang.set(userId, lang);
}

// Re-export guild settings for callers that import from i18n
export {
  getGuildDefaultLang,
  setGuildDefaultLang,
  getGuildDrunkOverlap,
  setGuildDrunkOverlap,
} from "../guild-settings";

export function getRoleName(lang: Lang, roleId: string): string {
  return roleDefById.get(roleId)?.name[lang] ?? roleId;
}

/** Retrieve the rules-reminder text for a role, or undefined if not found. */
export function getRoleGuide(lang: Lang, roleId: string): string | undefined {
  return roleDefById.get(roleId)?.guide[lang];
}

export function roleParam(roleId: string): string {
  return `@role:${roleId}`;
}

function localizeParamValue(lang: Lang, value: string | number): string {
  if (typeof value === "number") return String(value);
  return value.replace(/@role:([a-z_]+)/gi, (_, roleId) =>
    getRoleName(lang, roleId),
  );
}

function normalizeLookupText(input: string): string {
  return input.trim().toLowerCase();
}

export function resolveRoleIdByLocalizedName(
  input: string,
): string | undefined {
  const query = normalizeLookupText(input);
  if (!query) return undefined;

  for (const def of ALL_ROLE_DEFINITIONS) {
    for (const name of Object.values(def.name)) {
      if (normalizeLookupText(name) === query) return def.id;
    }
  }

  return undefined;
}

/**
 * Retrieve a message in the given language, with optional named parameter substitution.
 * Use {paramName} placeholders in the JSON strings.
 */
export function t(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const str = strings[lang][key] ?? strings["en"][key] ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => {
    const value = params[k];
    if (value === undefined) return "";
    return localizeParamValue(lang, value);
  });
}
