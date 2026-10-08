export type PeriodKey = 'quarter' | 'last_quarter' | 'ytd' | 'last_30';
export const PERIOD_LABEL: Record<PeriodKey, string> = { quarter: 'This quarter', last_quarter: 'Last quarter', ytd: 'Year to date', last_30: 'Last 30 days' };

export interface Period { key: PeriodKey; label: string; start: Date; end: Date; prevStart: Date; prevEnd: Date }

export function isPeriodKey(v: unknown): v is PeriodKey {
  return v === 'quarter' || v === 'last_quarter' || v === 'ytd' || v === 'last_30';
}

/** [start, end) ranges in UTC, plus the immediately preceding range of equal length for comparisons. */
export function periodRange(key: PeriodKey, now = new Date()): Period {
  const y = now.getUTCFullYear(); const q = Math.floor(now.getUTCMonth() / 3);
  let start: Date; let end: Date;
  if (key === 'quarter') { start = new Date(Date.UTC(y, q * 3, 1)); end = new Date(now.getTime() + 1); }
  else if (key === 'last_quarter') { start = new Date(Date.UTC(y, q * 3 - 3, 1)); end = new Date(Date.UTC(y, q * 3, 1)); }
  else if (key === 'ytd') { start = new Date(Date.UTC(y, 0, 1)); end = new Date(now.getTime() + 1); }
  else { start = new Date(now.getTime() - 30 * 86_400_000); end = new Date(now.getTime() + 1); }
  const len = end.getTime() - start.getTime();
  const qLabel = (d: Date) => `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  const label = key === 'quarter' || key === 'last_quarter' ? qLabel(start) : key === 'ytd' ? `${y} YTD` : 'Last 30 days';
  return { key, label, start, end, prevStart: new Date(start.getTime() - len), prevEnd: start };
}
