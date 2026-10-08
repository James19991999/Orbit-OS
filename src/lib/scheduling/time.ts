import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

export interface MemberWindow {
  userId: string;
  name?: string;
  timezone: string;   // IANA
  workStart: string;  // "HH:MM" or "HH:MM:SS"
  workEnd: string;
  city?: string | null;
}

const MIN = 60_000;

export function hhmm(t: string): string {
  return t.slice(0, 5);
}

/** UTC [start, end) of a member's working window on the given *local* calendar date (yyyy-MM-dd). */
export function workWindowUtc(m: MemberWindow, localDate: string): { start: number; end: number } {
  const start = fromZonedTime(`${localDate}T${hhmm(m.workStart)}:00`, m.timezone).getTime();
  let end = fromZonedTime(`${localDate}T${hhmm(m.workEnd)}:00`, m.timezone).getTime();
  if (end <= start) end += 24 * 60 * MIN; // overnight shifts
  return { start, end };
}

/** Local calendar date string for an instant in a zone. */
export function localDateOf(instant: number, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd');
}

export function isWeekendLocal(instant: number, timezone: string): boolean {
  const dow = toZonedTime(instant, timezone).getDay();
  return dow === 0 || dow === 6;
}

/** Working windows (UTC) that intersect [from, to), honouring weekends in the member's own zone. */
export function windowsBetween(m: MemberWindow, from: number, to: number, opts: { skipWeekends?: boolean } = {}) {
  const out: { start: number; end: number }[] = [];
  // walk local dates from (from - 1 day) to (to + 1 day) so the date line never drops a window
  for (let t = from - 24 * 60 * MIN; t < to + 24 * 60 * MIN; t += 24 * 60 * MIN) {
    const d = localDateOf(t, m.timezone);
    const w = workWindowUtc(m, d);
    if (opts.skipWeekends && isWeekendLocal(w.start, m.timezone)) continue;
    if (w.end > from && w.start < to && !out.some((o) => o.start === w.start)) out.push(w);
  }
  return out;
}

export function isWithinWorkingHours(m: MemberWindow, start: number, end: number, opts: { skipWeekends?: boolean } = {}): boolean {
  return windowsBetween(m, start, end, opts).some((w) => w.start <= start && w.end >= end);
}

export type DayPhase = 'starting' | 'working' | 'wrapping' | 'off';

/** Where a member is in their day right now (used for hub cards and presence labels). */
export function dayPhase(m: MemberWindow, now: number): DayPhase {
  const w = windowsBetween(m, now, now + 1).find((x) => x.start <= now && x.end > now);
  if (!w) return 'off';
  if (now - w.start < 60 * MIN) return 'starting';
  if (w.end - now <= 60 * MIN) return 'wrapping';
  return 'working';
}

export function localClock(now: number, timezone: string): string {
  return formatInTimeZone(now, timezone, 'HH:mm');
}

export function zoneAbbrev(now: number, timezone: string): string {
  return formatInTimeZone(now, timezone, 'zzz');
}

export function utcOffsetLabel(now: number, timezone: string): string {
  return 'UTC' + formatInTimeZone(now, timezone, 'xxx');
}

export type Region = 'Americas' | 'EMEA' | 'APAC';
export function regionOf(timezone: string): Region {
  if (timezone.startsWith('America/') || timezone.startsWith('US/') || timezone.startsWith('Canada/')) return 'Americas';
  if (timezone.startsWith('Asia/') || timezone.startsWith('Australia/') || timezone.startsWith('Pacific/')) return 'APAC';
  return 'EMEA';
}
