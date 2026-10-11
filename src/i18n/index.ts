// Full dictionaries: server code (pages, routes, emails, WhatsApp) and tests. Client components use
// '@/i18n/client' (useT) or '@/i18n/shared' instead, so the dictionaries stay out of browser bundles.
import { en, type MessageKey } from './en';
import { sw } from './sw';
import { fr } from './fr';
import { lookup, SERVER_ONLY_PREFIXES, type Language, type Messages, type T } from './shared';

export * from './shared';

const DICTS: Record<Language, Messages> = { en, sw, fr };
const FILLED: Partial<Record<Language, Messages>> = {};

/** The language's dictionary with English filled in for anything missing. */
export function dictionary(lang: Language): Messages {
  return (FILLED[lang] ??= lang === 'en' ? en : { ...en, ...Object.fromEntries(Object.entries(DICTS[lang]).filter(([, v]) => v)) });
}

/** Translate a key, filling {name}-style placeholders. Missing translations fall back to English. */
export function translate(lang: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  return lookup(dictionary(lang), key, vars);
}

export function makeT(lang: Language): T {
  const d = dictionary(lang);
  return (key, vars) => lookup(d, key, vars);
}

const CLIENT: Partial<Record<Language, Messages>> = {};
/** The strings client components may need, in one language (sent to the browser with each page). */
export function clientMessages(lang: Language): Messages {
  return (CLIENT[lang] ??= Object.fromEntries(Object.entries(dictionary(lang)).filter(([k]) => !SERVER_ONLY_PREFIXES.some((p) => k.startsWith(p)))));
}

/** Share of English keys translated, per language (shown in docs and tests). */
export function coverage(lang: Language): number {
  const keys = Object.keys(en);
  return keys.filter((k) => DICTS[lang][k as MessageKey]).length / keys.length;
}
