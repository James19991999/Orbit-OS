// The timing rules behind each automation, kept pure so they can be tested on their own.
import { addDays } from '@/lib/templates';

export interface AutomationSettings {
  onboarding: boolean;
  invoice_reminders: boolean;
  overdue_nudges: boolean;
  nudge_after_days: number;
  escalate_after_days: number;
  leave_handover: boolean;
}

/** What a workspace gets before anyone opens the Automations settings. */
export const DEFAULT_SETTINGS: AutomationSettings = {
  onboarding: true, invoice_reminders: false, overdue_nudges: true, nudge_after_days: 2, escalate_after_days: 5, leave_handover: true,
};

export function withDefaults(row: Partial<AutomationSettings> | null | undefined): AutomationSettings {
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(row ?? {}).filter(([, v]) => v !== null && v !== undefined)) };
}

/** Whole days from a to b (both yyyy-mm-dd). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export type InvoiceStep = 'before3' | 'due' | 'after3' | 'after7';

/**
 * Which reminder an unpaid invoice is ready for: 3 days before, on the due date, then 3 and 7 days late.
 * Only the latest stage reached is returned, so an invoice found 10 days late gets one "7 days late" reminder,
 * never the earlier ones in a burst.
 */
export function invoiceStep(dueOn: string, today: string): InvoiceStep | null {
  const d = daysBetween(dueOn, today);
  if (d >= 7) return 'after7';
  if (d >= 3) return 'after3';
  if (d >= 0) return 'due';
  if (d >= -3) return 'before3';
  return null;
}

/** Overdue: nudge the assignee after N days, then tell a manager after M days. Steps are tied to the due date. */
export function overdueSteps(dueOn: string, today: string, s: Pick<AutomationSettings, 'nudge_after_days' | 'escalate_after_days'>) {
  const late = daysBetween(dueOn, today);
  return { late, nudge: late >= s.nudge_after_days, escalate: late >= s.escalate_after_days };
}

/** Handover reminder: approved time off starting within the next 3 days (or already started) with no cover chosen. */
export function handoverDue(startsOn: string, endsOn: string, today: string): boolean {
  return endsOn >= today && startsOn <= addDays(today, 3);
}

/** Messages to people go out on weekdays during the working day in their own time zone. */
export function inWorkingWindow(localHour: number, isoWeekday: number, from = 8, to = 18): boolean {
  return isoWeekday <= 5 && localHour >= from && localHour < to;
}
