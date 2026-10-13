// Timing rules for the founder-side emails, kept pure so they can be tested on their own.
import { daysBetween } from '@/lib/automations/rules';

export type TrialStep = 'd1' | 'd3' | 'd7' | 'ending';

/**
 * Which trial email a workspace is ready for (dates are yyyy-mm-dd in the owner's time zone): a welcome the day after
 * sign-up, a nudge on day 3, a halfway summary on day 7, and a "trial ends soon" notice 2 days before it ends.
 * Only the latest stage reached is returned, so nobody gets a burst of old emails.
 */
export function trialStep(createdOn: string, endsOn: string, today: string): TrialStep | null {
  const left = daysBetween(today, endsOn);
  if (left < 0) return null;
  if (left <= 2) return 'ending';
  const age = daysBetween(createdOn, today);
  if (age >= 7) return 'd7';
  if (age >= 3) return 'd3';
  if (age >= 1) return 'd1';
  return null;
}

export type LapsedStep = 'l1' | 'l7' | 'l30';

/** After a plan runs out (the workspace is read-only): a note the next day, a reminder after a week, a last one after 30 days. */
export function lapsedStep(expiredAt: string, now: Date): LapsedStep | null {
  const days = (now.getTime() - Date.parse(expiredAt)) / 86_400_000;
  if (days < 1 || days > 35) return null;
  if (days >= 30) return 'l30';
  if (days >= 7) return 'l7';
  return 'l1';
}

/** ISO-8601 week for a yyyy-mm-dd date, e.g. 2026-W42. */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;            // Monday = 0
  d.setUTCDate(d.getUTCDate() - wd + 3);          // Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
