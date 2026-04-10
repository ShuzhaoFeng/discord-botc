import enStrings from "./en.json";
import zhStrings from "./zh.json";
import { Lang } from "../game/types";
import { getGuildDefaultLang } from "../guild-settings";

const strings: Record<Lang, Record<string, string>> = {
  en: enStrings as Record<string, string>,
  zh: zhStrings as Record<string, string>,
};

type TranslationParams = Record<string, string | number>;

let cachedRoleDefsById: Map<
  string,
  { id: string; name: Record<Lang, string>; guide: Record<Lang, string> }
> | null = null;
let cachedRoleDefs: Array<{
  id: string;
  name: Record<Lang, string>;
  guide: Record<Lang, string>;
}> | null = null;

function ensureRoleDefinitions(): Array<{
  id: string;
  name: Record<Lang, string>;
  guide: Record<Lang, string>;
}> {
  if (cachedRoleDefs) return cachedRoleDefs;
  // Lazy load to avoid i18n <-> roles circular import at module initialization.
  const { ALL_ROLE_DEFINITIONS } =
    require("../roles") as typeof import("../roles");
  cachedRoleDefs = ALL_ROLE_DEFINITIONS;
  return cachedRoleDefs;
}

function ensureRoleDefById(): Map<
  string,
  { id: string; name: Record<Lang, string>; guide: Record<Lang, string> }
> {
  if (cachedRoleDefsById) return cachedRoleDefsById;
  cachedRoleDefsById = new Map(ensureRoleDefinitions().map((r) => [r.id, r]));
  return cachedRoleDefsById;
}

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

/**
 * User-scoped translation helper that resolves language from user and guild context.
 */
function tForUser(
  userId: string,
  guildId: string | null | undefined,
  key: string,
  params?: TranslationParams,
): string {
  return t(getLang(userId, guildId), key, params);
}

/**
 * Creates a translator bound to one user/guild context.
 */
export function useTranslation(
  userId: string,
  guildId: string | null | undefined,
): (key: string, params?: TranslationParams) => string {
  return (key: string, params?: TranslationParams) =>
    tForUser(userId, guildId, key, params);
}

// Re-export guild settings for callers that import from i18n
export {
  getGuildDefaultLang,
  setGuildDefaultLang,
} from "../guild-settings";

export function getRoleName(lang: Lang, roleId: string): string {
  return ensureRoleDefById().get(roleId)?.name[lang] ?? roleId;
}

/** Retrieve the rules-reminder text for a role, or undefined if not found. */
export function getRoleGuide(lang: Lang, roleId: string): string | undefined {
  return ensureRoleDefById().get(roleId)?.guide[lang];
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

  for (const def of ensureRoleDefinitions()) {
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
export function t(lang: Lang, key: string, params?: TranslationParams): string {
  const str = strings[lang][key] ?? strings["en"][key] ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => {
    const value = params[k];
    if (value === undefined) return "";
    return localizeParamValue(lang, value);
  });
}
