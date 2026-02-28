import { Lang } from '../game/types';
import { en, Messages, ROLE_GUIDE_EN } from './en';
import { zh, ROLE_GUIDE_ZH } from './zh';

const strings: Record<Lang, Messages> = { en, zh };

/** Per-user language preferences (lives for bot session lifetime). */
const userLang = new Map<string, Lang>();

export function getLang(userId: string): Lang {
  return userLang.get(userId) ?? 'en';
}

export function setLang(userId: string, lang: Lang): void {
  userLang.set(userId, lang);
}

/** Retrieve the detailed rules-reminder text for a role, or undefined if not found. */
export function getRoleGuide(lang: Lang, roleId: string): string | undefined {
  return lang === 'zh' ? ROLE_GUIDE_ZH[roleId] : ROLE_GUIDE_EN[roleId];
}

/**
 * Retrieve a message in the given language.
 * `key` is the message key; remaining args are passed to the message function.
 */
export function t<K extends keyof Messages>(
  lang: Lang,
  key: K,
  ...args: Parameters<Messages[K]>
): string {
  const fn = strings[lang][key] as (...a: unknown[]) => string;
  return fn(...(args as unknown[]));
}
