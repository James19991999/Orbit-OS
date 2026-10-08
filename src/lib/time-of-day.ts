import { formatInTimeZone } from 'date-fns-tz';

export function greeting(timezone: string, now = new Date()): string {
  const h = Number(formatInTimeZone(now, timezone || 'UTC', 'H'));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
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
