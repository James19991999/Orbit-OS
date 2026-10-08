export type Currency = 'KES' | 'USD';

/** Format minor units (cents) as currency, e.g. 123456 KES -> "KES 1,234.56" */
export function formatMoney(minor: number, currency: Currency, opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const value = minor / 100;
  if (opts.compact && Math.abs(value) >= 10_000) {
    const fmt = new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 });
    return `${currency} ${fmt.format(value)}`;
  }
  const fmt = new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: opts.decimals === false ? 0 : 2,
    maximumFractionDigits: opts.decimals === false ? 0 : 2,
  });
  return `${currency} ${fmt.format(value)}`;
}

/** Parse a user-entered amount ("1,250.50") into minor units. Returns null when invalid. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '');
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

export function relativeTime(date: Date | string | number, now: Date = new Date()): string {
  const d = new Date(date);
  const diff = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 45) return diff < 0 ? 'just now' : 'in a moment';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}
