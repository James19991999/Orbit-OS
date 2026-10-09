import { en, type MessageKey } from './en';
import { sw } from './sw';
import { fr } from './fr';

export type Language = 'en' | 'sw' | 'fr';
export type { MessageKey };
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'sw', label: 'Kiswahili' },
  { value: 'fr', label: 'Français' },
];
export const LANGUAGE_COOKIE = 'orbit_lang';

const DICTS: Record<Language, Partial<Record<MessageKey, string>>> = { en, sw, fr };

export function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'sw' || v === 'fr';
}

/** Picks a supported UI language from a cookie, then Accept-Language ("sw-KE", "fr-FR;q=0.9"), else English. */
export function resolveLanguage(cookie: string | null | undefined, acceptLanguage?: string | null): Language {
  if (isLanguage(cookie)) return cookie;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const base = part.split(';')[0]!.trim().toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}

/** Translate a key, filling {name}-style placeholders. Missing translations fall back to English. */
export function translate(lang: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = DICTS[lang]?.[key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;
export function makeT(lang: Language): T {
  return (key, vars) => translate(lang, key, vars);
}

/** Share of English keys translated, per language (shown in docs and tests). */
export function coverage(lang: Language): number {
  const keys = Object.keys(en);
  return keys.filter((k) => DICTS[lang][k as MessageKey]).length / keys.length;
}
