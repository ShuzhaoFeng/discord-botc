import type { Lang } from "../game/types";

type Params = Record<string, string | number>;

export type LocaleBundle<K extends string> = Partial<
  Record<Lang, Record<K, string>>
>;

const FALLBACK_LANG: Lang = "en";

/**
 * Per-role translator over a locale bundle. Same `{paramName}` placeholders
 * and `en` fallback as the global `t()`, but the lookup is scoped to the
 * role's own JSON files so role code does not reach into global i18n.
 */
export function createRoleTranslator<K extends string>(
  bundle: LocaleBundle<K>,
): (lang: Lang, key: K, params?: Params) => string {
  return (lang, key, params) => {
    const str =
      bundle[lang]?.[key] ?? bundle[FALLBACK_LANG]?.[key] ?? (key as string);
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => {
      const value = params[k];
      return value === undefined ? "" : String(value);
    });
  };
}

/**
 * Extract one field across every locale in a bundle, producing a Lang-indexed
 * object suitable for `RoleDefinition.name` / `.guide`. Locales that lack the
 * field are simply omitted.
 */
export function localize<K extends string>(
  bundle: LocaleBundle<K>,
  field: K,
): Partial<Record<Lang, string>> {
  const result: Partial<Record<Lang, string>> = {};
  for (const lang of Object.keys(bundle) as Lang[]) {
    const strings = bundle[lang];
    if (strings && field in strings) {
      result[lang] = strings[field];
    }
  }
  return result;
}
