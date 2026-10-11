import { formatInTimeZone } from 'date-fns-tz';

export function greetingKey(timezone: string, now = new Date()): 'p.dash.morning' | 'p.dash.afternoon' | 'p.dash.evening' {
  const h = Number(formatInTimeZone(now, timezone || 'UTC', 'H'));
  return h < 12 ? 'p.dash.morning' : h < 17 ? 'p.dash.afternoon' : 'p.dash.evening';
}

export function quarterDay(now = new Date()) {
  const q = Math.floor(now.getUTCMonth() / 3);
  const start = Date.UTC(now.getUTCFullYear(), q * 3, 1);
  const day = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86_400_000) + 1;
  return { quarter: q + 1, day };
}

export function fmtUtcTime(ms: number) {
  return new Date(ms).toISOString().slice(11, 16);
}
