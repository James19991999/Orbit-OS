import { formatMoney, parseMoneyToMinor, relativeTime, type Currency } from '@/lib/format';
import { REGION_CONVENTIONS, formatDateWith, formatSlot, regionOf, type DateStyle, type UiLang } from './conventions';

export type { DateStyle, UiLang };

/**
 * Numbers, money and date order follow each user's region (month and weekday names follow their language):
 * a browser set to de-DE gets English text with German conventions (locale "en-DE" → 1.234,56),
 * en-US gets "Oct 8, 2026" and "$1,234.56". Resolved from the orbit_locale cookie (Profile →
 * Region format) or the Accept-Language header, falling back to en-KE.
 */
export const DEFAULT_LOCALE = 'en-KE';
export const LOCALE_COOKIE = 'orbit_locale';

/** Choices offered in Profile → Region format ('' = follow the browser). */
export const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Automatic (from your browser)' },
  { value: 'en-KE', label: 'Kenya' },
  { value: 'en-US', label: 'United States' },
  { value: 'en-GB', label: 'United Kingdom' },
  { value: 'en-CA', label: 'Canada' },
  { value: 'en-AU', label: 'Australia' },
  { value: 'en-IN', label: 'India' },
  { value: 'en-NG', label: 'Nigeria' },
  { value: 'en-ZA', label: 'South Africa' },
  { value: 'en-IE', label: 'Ireland' },
  { value: 'en-DE', label: 'Germany' },
  { value: 'en-FR', label: 'France' },
  { value: 'en-NL', label: 'Netherlands' },
];

/** Turns any locale tag ("de-DE", "fr-FR", "en-us") into "en-<REGION>" when we support that region, else null. */
export function englishForRegion(tag: string | null | undefined): string | null {
  if (!tag) return null;
  let region = '';
  try {
    const loc = new Intl.Locale(tag.trim());
    region = (loc.region ?? '').toUpperCase();
  } catch {
    return null;
  }
  return region && REGION_CONVENTIONS[region] ? `en-${region}` : null;
}

/** Picks the first usable region from an Accept-Language header ("de-DE,de;q=0.9,en;q=0.8"). */
export function localeFromAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const tags = header.split(',')
    .map((part) => { const [tag, ...params] = part.trim().split(';'); const q = params.find((p) => p.trim().startsWith('q=')); return { tag: tag!.trim(), q: q ? Number(q.trim().slice(2)) || 0 : 1 }; })
    .filter((t) => t.tag && t.tag !== '*')
    .sort((a, b) => b.q - a.q);
  for (const t of tags) {
    // Only tags that name a region ("en-US", "de-DE") — a bare "en" says nothing about format.
    if (!t.tag.includes('-')) continue;
    const l = englishForRegion(t.tag);
    if (l) return l;
  }
  return null;
}

/** Cookie value wins (must be one of the offered choices), then the header, then en-KE. */
export function resolveLocale(cookieValue: string | null | undefined, acceptLanguage: string | null | undefined): string {
  if (cookieValue && REGION_OPTIONS.some((o) => o.value && o.value === cookieValue)) return cookieValue;
  return localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/** Locale used where there's no viewer (client-facing invoice emails, scheduled digests). */
export function localeForCurrency(currency: Currency): string {
  return ({ KES: 'en-KE', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB' } as const)[currency];
}

/** Currency a visitor most likely pays in, from their region (pricing page default). */
export function currencyForLocale(locale: string): Currency {
  let region = regionOf(locale);
  if (!region) { try { region = new Intl.Locale(locale).region ?? ''; } catch { /* ignore */ } }
  if (region === 'KE') return 'KES';
  if (region === 'GB') return 'GBP';
  if (['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'].includes(region)) return 'EUR';
  return region ? 'USD' : 'KES';
}

export interface Formatter {
  locale: string;
  timeZone: string;
  money: (minor: number, currency: Currency, opts?: { compact?: boolean; decimals?: boolean }) => string;
  parseMoney: (input: string) => number | null;
  date: (d: Date | string | number, style?: DateStyle) => string;
  relative: (d: Date | string | number, now?: Date) => string;
  /** "Mon 12 Oct · 14:30" in a time zone (default: the viewer's). */
  slot: (d: Date | string | number, timeZone?: string, withDate?: boolean) => string;
  lang: UiLang;
}

/** Region-formatted date. Bare dates ("2026-10-08") never shift; timestamps show in `timeZone`. */
export function formatDate(d: Date | string | number, style: DateStyle = 'short', locale = DEFAULT_LOCALE, timeZone = 'UTC', lang: UiLang = 'en'): string {
  return formatDateWith(d, locale, style, timeZone, lang);
}

export function makeFormatter(locale: string = DEFAULT_LOCALE, timeZone = 'UTC', lang: UiLang = 'en'): Formatter {
  return {
    locale,
    timeZone,
    lang,
    money: (minor, currency, opts = {}) => formatMoney(minor, currency, { ...opts, locale }),
    parseMoney: (input) => parseMoneyToMinor(input, locale),
    date: (d, style) => formatDate(d, style, locale, timeZone, lang),
    relative: (d, now) => relativeTime(d, now, locale, timeZone, lang),
    slot: (d, tz, withDate = true) => formatSlot(d, tz ?? timeZone, lang, withDate),
  };
}
