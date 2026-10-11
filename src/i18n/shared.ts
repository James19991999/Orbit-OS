// Light, client-safe i18n pieces: languages, detection and placeholder filling. Dictionaries are NOT imported
// here, so client bundles never carry every language; pages receive just their language's strings.
import type { MessageKey } from './en';

export type Language = 'en' | 'sw' | 'fr';
export type { MessageKey };
export type Messages = Partial<Record<MessageKey, string>>;
export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'sw', label: 'Kiswahili' },
  { value: 'fr', label: 'Français' },
];
export const LANGUAGE_COOKIE = 'orbit_lang';

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

/** Looks a key up in a (fallback-filled) dictionary: "<key>_one" when count is 1, then fills {name} placeholders. */
export function lookup(dict: Messages, key: MessageKey, vars?: Record<string, string | number>): string {
  const one = vars?.count === 1 ? dict[`${key}_one` as MessageKey] : undefined;
  const raw = one ?? dict[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Client-side t() over the strings the server sent for this page. */
export function makeClientT(messages: Messages): T {
  return (key, vars) => lookup(messages, key, vars);
}

/** Keys only server code uses (emails, WhatsApp, AI brief text, and 'p.' = server-rendered page text): never sent to browsers. */
export const SERVER_ONLY_PREFIXES = ['email.', 'wa.', 'ai.r.', 'p.', 'audit.', 'mk.'];
