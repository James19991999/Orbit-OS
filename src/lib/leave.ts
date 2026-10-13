// Leave and time off: shared rules (the database computes the same working-day count).
export const LEAVE_KINDS = ['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'study', 'unpaid', 'other'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export type LeaveStatus = 'pending' | 'approved' | 'declined' | 'cancelled';
export interface LeaveRequest {
  id: string; created_at: string; org_id: string; user_id: string; kind: LeaveKind; starts_on: string; ends_on: string; days: number;
  note: string | null; status: LeaveStatus; decided_by: string | null; decided_at: string | null; decision_note: string | null; cover_id?: string | null;
}
export interface AwayRow { user_id: string; starts_on: string; ends_on: string; cover_id?: string | null }

/** Kenya's Employment Act: at least 21 working days of annual leave a year. */
export const DEFAULT_ANNUAL_DAYS = 21;

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Monday–Friday days between two yyyy-MM-dd dates, inclusive (public holidays not subtracted). */
export function weekdaysBetween(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 0;
  let n = 0;
  for (let t = day(from); t <= day(to); t += 86_400_000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** Annual leave used and booked this calendar year (approved counts as used; pending as booked). */
export function annualBalance(requests: Pick<LeaveRequest, 'kind' | 'status' | 'starts_on' | 'days'>[], allowance: number, year: number) {
  const mine = requests.filter((r) => r.kind === 'annual' && r.starts_on.startsWith(String(year)));
  const used = mine.filter((r) => r.status === 'approved').reduce((s, r) => s + r.days, 0);
  const pending = mine.filter((r) => r.status === 'pending').reduce((s, r) => s + r.days, 0);
  return { allowance, used, pending, left: allowance - used - pending };
}

/** Whether an approved stretch of leave covers a date (yyyy-MM-dd). */
export const awayOn = (rows: AwayRow[], userId: string, date: string) => rows.some((r) => r.user_id === userId && r.starts_on <= date && r.ends_on >= date);
