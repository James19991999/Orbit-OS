import { conventionsFor, formatNumberWith, formatDateWith, regionOf } from '@/lib/locale/conventions';

export const CURRENCIES = ['KES', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_NAMES: Record<Currency, string> = { KES: 'Kenyan shilling', USD: 'US dollar', EUR: 'Euro', GBP: 'British pound' };
export function isCurrency(v: unknown): v is Currency {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}


/** Regions that have their own dollar, where a bare "$" would be ambiguous for US dollars. */
const DOLLAR_REGIONS = new Set(['AU', 'BS', 'BZ', 'CA', 'FJ', 'GY', 'HK', 'JM', 'LR', 'NA', 'NZ', 'SB', 'SG', 'TT', 'TW', 'ZW']);

/** The prefix we print (never from Intl — browsers and Node disagree, e.g. en-CA "US$" vs "$"). */
export function currencyPrefix(currency: Currency, locale = 'en-KE'): string {
  switch (currency) {
    case 'USD': return DOLLAR_REGIONS.has(regionOf(locale)) ? 'US$' : '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    default: return 'KES ';
  }
}

/**
 * Format minor units (cents) as money for the viewer's region:
 * en-KE "KES 1,234.56" · en-US "$1,234.56" · en-GB "£1,234.56" · en-DE "€1.234,56" · en-CA "US$1,234.56".
 * Built from src/lib/locale/conventions.ts so server and browser render identical text.
 */
export function formatMoney(minor: number, currency: Currency, opts: { compact?: boolean; decimals?: boolean; locale?: string } = {}): string {
  const value = minor / 100;
  const locale = opts.locale ?? 'en-KE';
  const compact = Boolean(opts.compact && Math.abs(value) >= 10_000);
  const d = opts.decimals === false ? 0 : 2;
  const number = formatNumberWith(Math.abs(value), locale, compact ? { compact: true } : { min: d, max: d });
  const negative = value < 0 && /[1-9]/.test(number);
  return `${negative ? '-' : ''}${currencyPrefix(currency, locale)}${number}`;
}

/** Just the number part (chart axes), e.g. "1.2M" / "1,2M" — no currency sign. */
export function formatAmount(minor: number, opts: { compact?: boolean; locale?: string } = {}): string {
  return formatNumberWith(minor / 100, opts.locale ?? 'en-KE', opts.compact ? { compact: true } : { max: 2 });
}

/**
 * Parse a user-entered amount into minor units. Returns null when invalid.
 * Accepts the viewer's own separators ("1,250.50" in en-US, "1.250,50" in en-DE) and plain "1250.5".
 */
export function parseMoneyToMinor(input: string, locale = 'en-KE'): number | null {
  const { group, decimal } = conventionsFor(locale);
  let cleaned = input.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (decimal === ',') {
    // "1.250,50" → "1250.50"
    if (cleaned.includes(',')) cleaned = (group === '.' ? cleaned.split('.').join('') : cleaned).replace(',', '.');
    // No comma: "1.250" / "1.250.000" are grouped thousands; "1250.50" is a dot-decimal typed by habit.
    else if (group === '.' && /^\d{1,3}(\.\d{3})+$/.test(cleaned)) cleaned = cleaned.split('.').join('');
  } else {
    cleaned = cleaned.split(group).join('');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function formatPct(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

export function signed(value: number, digits = 1, suffix = ''): string {
  const s = value.toFixed(digits);
  return `${value > 0 ? '+' : ''}${s}${suffix}`;
}

export function relativeTime(date: Date | string | number, now: Date = new Date(), locale = 'en-KE', timeZone = 'UTC'): string {
  const d = new Date(date);
  const diff = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 45) return diff < 0 ? 'just now' : 'in a moment';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDateWith(d, locale, 'short', timeZone);
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}
