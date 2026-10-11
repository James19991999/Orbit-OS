/**
 * Number and date conventions per region, defined here rather than read from Intl.
 * Why: browsers ship trimmed locale data for "English + region" locales, so Intl gives different
 * answers in Node and Chrome (en-FR is "1 234,50" in Node but "1,234.50" in Chrome; en-CA writes
 * "US$" in one and "$" in the other). Server and browser must produce byte-identical text, so
 * every offered region is spelled out explicitly. Unknown regions fall back to Kenya.
 */
export interface Conventions {
  group: string;          // thousands separator
  decimal: string;        // decimal separator
  indian?: boolean;       // 12,34,567 grouping
  order: 'DMY' | 'MDY';   // 8 Oct 2026 vs Oct 8, 2026
  clock: 12 | 24;
}

const COMMA_DOT = { group: ',', decimal: '.' };

export const REGION_CONVENTIONS: Record<string, Conventions> = {
  KE: { ...COMMA_DOT, order: 'DMY', clock: 24 },
  US: { ...COMMA_DOT, order: 'MDY', clock: 12 },
  GB: { ...COMMA_DOT, order: 'DMY', clock: 24 },
  CA: { ...COMMA_DOT, order: 'MDY', clock: 12 },
  AU: { ...COMMA_DOT, order: 'DMY', clock: 12 },
  IN: { ...COMMA_DOT, indian: true, order: 'DMY', clock: 12 },
  NG: { ...COMMA_DOT, order: 'DMY', clock: 12 },
  ZA: { group: ' ', decimal: ',', order: 'DMY', clock: 24 },
  IE: { ...COMMA_DOT, order: 'DMY', clock: 24 },
  DE: { group: '.', decimal: ',', order: 'DMY', clock: 24 },
  FR: { group: ' ', decimal: ',', order: 'DMY', clock: 24 },
  NL: { group: '.', decimal: ',', order: 'DMY', clock: 24 },
};

export function regionOf(locale: string): string {
  const m = /^[a-z]{2,3}-([A-Z]{2})$/i.exec(locale.trim());
  return m ? m[1]!.toUpperCase() : '';
}

export function conventionsFor(locale: string): Conventions {
  return REGION_CONVENTIONS[regionOf(locale)] ?? REGION_CONVENTIONS.KE!;
}

function groupDigits(int: string, c: Conventions): string {
  if (int.length <= 3) return int;
  if (c.indian) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, c.group);
    return `${rest}${c.group}${last3}`;
  }
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, c.group);
}

/** Plain number with the region's separators. Rounds half away from zero to `max` decimals. */
export function formatNumberWith(value: number, locale: string, opts: { min?: number; max?: number; compact?: boolean } = {}): string {
  const c = conventionsFor(locale);
  const neg = value < 0;
  let abs = Math.abs(value);
  let suffix = '';
  let min = opts.min ?? 0;
  let max = opts.max ?? 2;
  if (opts.compact && abs >= 1000) {
    const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    const [div, s] = units.find(([d]) => abs >= d)!;
    abs = abs / div; suffix = s; min = 0; max = 1;
    if (Number(abs.toFixed(max)) >= 1000 && s !== 'T') { const up = units[units.findIndex(([d]) => d === div) - 1]!; abs = (abs * div) / up[0]; suffix = up[1]; }
  }
  const factor = 10 ** max;
  const rounded = Math.round((abs + Number.EPSILON) * factor) / factor;
  let [int, frac = ''] = rounded.toFixed(max).split('.') as [string, string?];
  frac = frac.replace(/0+$/, '');
  if (frac.length < min) frac = frac.padEnd(min, '0');
  const body = groupDigits(int, c) + (frac ? c.decimal + frac : '');
  const isZero = !/[1-9]/.test(int + frac);
  return `${neg && !isZero ? '-' : ''}${body}${suffix}`;
}

export type UiLang = 'en' | 'sw' | 'fr';
/** Month and weekday names per UI language (explicit, so server and browser always agree). */
const NAMES: Record<UiLang, { short: string[]; long: string[]; days: string[] }> = {
  en: { short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  sw: { short: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'],
    long: ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'],
    days: ['Jpi', 'Jtt', 'Jnn', 'Jtn', 'Alh', 'Ijm', 'Jms'] },
  fr: { short: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    long: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    days: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'] },
};

export type DateStyle = 'short' | 'long' | 'datetime' | 'month';

// Creating Intl formatters is slow (and much slower on phones), so one is kept per time zone.
const PARTS_FMT = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = PARTS_FMT.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    } catch {
      f = partsFormatter('UTC'); // unknown zone → UTC
    }
    PARTS_FMT.set(timeZone, f);
  }
  return f;
}

function partsIn(d: Date, timeZone: string) {
  // en-US numeric parts are present in every ICU build; only the numbers are used.
  const p = partsFormatter(timeZone || 'UTC').formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute') };
}

/**
 * Formats a date for a region. Bare calendar dates ("2026-10-08") are never shifted by time zone;
 * timestamps are shown in `timeZone` (the user's own, default UTC).
 */
export function formatDateWith(input: Date | string | number, locale: string, style: DateStyle = 'short', timeZone = 'UTC', lang: UiLang = 'en'): string {
  const c = conventionsFor(locale);
  const N = NAMES[lang];
  const bare = typeof input === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(input);
  const d = bare ? new Date(`${(input as string).length === 7 ? `${input}-01` : input}T12:00:00Z`) : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const { y, m, d: day, h, min } = partsIn(d, bare || style === 'month' ? 'UTC' : timeZone);
  if (style === 'month') return N.short[m - 1]!;
  const names = style === 'long' ? N.long : N.short;
  // Month-first dates are an English (US/Canada) habit; Kiswahili and French always put the day first.
  const date = c.order === 'MDY' && lang === 'en' ? `${names[m - 1]} ${day}, ${y}` : `${day} ${names[m - 1]} ${y}`;
  if (style !== 'datetime') return date;
  const mm = String(min).padStart(2, '0');
  const time = c.clock === 12 && lang === 'en' ? `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:${mm}`;
  return `${date}, ${time}`;
}

/** "Mon 12 Oct · 14:30" (or "Mon 14:30") in a time zone, for meeting slots. Always 24-hour, like the rest of scheduling. */
export function formatSlot(input: Date | number | string, timeZone: string, lang: UiLang = 'en', withDate = true): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const { y, m, d: day, h, min } = partsIn(d, timeZone);
  const N = NAMES[lang];
  const wd = N.days[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]!;
  const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  return withDate ? `${wd} ${day} ${N.short[m - 1]} · ${time}` : `${wd} ${time}`;
}
