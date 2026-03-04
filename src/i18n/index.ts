import enStrings from "./en.json";
import zhStrings from "./zh.json";
import { Lang } from "../game/types";

const strings: Record<Lang, Record<string, string>> = {
  en: enStrings as Record<string, string>,
  zh: zhStrings as Record<string, string>,
};

/** Per-user language preferences (lives for bot session lifetime). */
const userLang = new Map<string, Lang>();

export function getLang(userId: string): Lang {
  return userLang.get(userId) ?? "en";
}

export function setLang(userId: string, lang: Lang): void {
  userLang.set(userId, lang);
}

/** Retrieve the detailed rules-reminder text for a role, or undefined if not found. */
export function getRoleGuide(lang: Lang, roleId: string): string | undefined {
  return (
    strings[lang][`roleGuide.${roleId}`] ?? strings["en"][`roleGuide.${roleId}`]
  );
}

export function getRoleName(lang: Lang, roleId: string): string {
  return t(lang, `roleName.${roleId}`);
}

export function getRoleDescription(lang: Lang, roleId: string): string {
  return t(lang, `roleDesc.${roleId}`);
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

  for (const localeStrings of Object.values(strings)) {
    for (const [key, value] of Object.entries(localeStrings)) {
      if (!key.startsWith("roleName.")) continue;
      if (normalizeLookupText(value) === query) {
        return key.slice("roleName.".length);
      }
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
