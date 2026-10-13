import { invoiceStep, overdueSteps, handoverDue, inWorkingWindow, withDefaults, daysBetween, DEFAULT_SETTINGS } from '@/lib/automations/rules';
import { NEW_MEMBER_TASKS } from '@/lib/templates';
import { localizeNotification } from '@/lib/notification-text';
import { makeT } from '@/i18n';

describe('invoice reminders', () => {
  it('sends 3 days before, on the day, then 3 and 7 days late', () => {
    expect(invoiceStep('2026-11-10', '2026-11-06')).toBeNull();
    expect(invoiceStep('2026-11-10', '2026-11-07')).toBe('before3');
    expect(invoiceStep('2026-11-10', '2026-11-09')).toBe('before3');
    expect(invoiceStep('2026-11-10', '2026-11-10')).toBe('due');
    expect(invoiceStep('2026-11-10', '2026-11-13')).toBe('after3');
    expect(invoiceStep('2026-11-10', '2026-11-17')).toBe('after7');
  });
  it('an invoice found long overdue gets only the latest reminder, never a burst', () => {
    expect(invoiceStep('2026-09-01', '2026-11-10')).toBe('after7');
  });
  it('counts days across month and year ends', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(invoiceStep('2026-12-30', '2027-01-02')).toBe('after3');
  });
});

describe('overdue nudges', () => {
  const s = { nudge_after_days: 2, escalate_after_days: 5 };
  it('nudges the person first, then escalates', () => {
    expect(overdueSteps('2026-11-10', '2026-11-11', s)).toEqual({ late: 1, nudge: false, escalate: false });
    expect(overdueSteps('2026-11-10', '2026-11-12', s)).toEqual({ late: 2, nudge: true, escalate: false });
    expect(overdueSteps('2026-11-10', '2026-11-15', s)).toEqual({ late: 5, nudge: true, escalate: true });
  });
});

describe('handover', () => {
  it('reminds from 3 days before the time off until it ends', () => {
    expect(handoverDue('2026-11-20', '2026-11-24', '2026-11-16')).toBe(false);
    expect(handoverDue('2026-11-20', '2026-11-24', '2026-11-17')).toBe(true);
    expect(handoverDue('2026-11-20', '2026-11-24', '2026-11-24')).toBe(true);
    expect(handoverDue('2026-11-20', '2026-11-24', '2026-11-25')).toBe(false);
  });
});

describe('working window and defaults', () => {
  it('messages only go out on weekdays in working hours', () => {
    expect(inWorkingWindow(9, 1)).toBe(true);
    expect(inWorkingWindow(7, 3)).toBe(false);
    expect(inWorkingWindow(18, 3)).toBe(false);
    expect(inWorkingWindow(11, 6)).toBe(false);
  });
  it('invoice reminders start off; the rest start on', () => {
    expect(DEFAULT_SETTINGS.invoice_reminders).toBe(false);
    expect(withDefaults(null)).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults({ overdue_nudges: false, nudge_after_days: 3 })).toMatchObject({ overdue_nudges: false, nudge_after_days: 3, onboarding: true });
  });
});

describe('new member checklist', () => {
  it('has tasks for the person and their manager, in all three languages, with the name filled in', () => {
    expect(NEW_MEMBER_TASKS.some((x) => x.who === 'member')).toBe(true);
    expect(NEW_MEMBER_TASKS.some((x) => x.who === 'manager')).toBe(true);
    for (const x of NEW_MEMBER_TASKS) for (const l of ['en', 'sw', 'fr'] as const) {
      expect(x.title[l].length).toBeGreaterThan(5);
      expect(x.title[l].includes('{name}')).toBe(x.who === 'manager');
    }
  });
});

describe('automation notifications are shown in the reader’s language', () => {
  const sw = makeT('sw'); const fr = makeT('fr'); const en = makeT('en');
  it('overdue, with the right plural', () => {
    expect(localizeNotification({ kind: 'overdue', title: 'A task of yours is overdue', body: '“X”' }, sw).title).toBe('Kazi yako moja imechelewa');
    expect(localizeNotification({ kind: 'overdue', title: '3 of your tasks are overdue', body: null }, fr).title).toBe('3 de vos tâches sont en retard');
  });
  it('escalation, handover, cover and invoice reminders', () => {
    expect(localizeNotification({ kind: 'escalation', title: 'Sam Otieno has 2 tasks over 5 days late', body: null }, en).title).toBe('Sam Otieno has 2 tasks over 5 days late');
    expect(localizeNotification({ kind: 'escalation', title: 'Sam Otieno has 1 task over 5 days late', body: null }, fr).title).toBe('Sam Otieno a une tâche en retard de plus de 5 jours');
    expect(localizeNotification({ kind: 'leave_cover', title: 'Sam asked you to cover', body: '2026-11-20 to 2026-11-24 · 1 tasks' }, sw))
      .toEqual({ title: 'Sam amekuomba ushughulikie kazi zake', body: '2026-11-20 hadi 2026-11-24 · kazi 1' });
    expect(localizeNotification({ kind: 'invoice_reminder', title: 'Reminder sent for invoice INV-7', body: 'Acme · after3' }, fr))
      .toEqual({ title: 'Relance envoyée pour la facture INV-7', body: 'Acme · 3 jours de retard' });
    expect(localizeNotification({ kind: 'onboarding', title: 'Your first-week checklist is ready', body: '5 tasks' }, sw))
      .toEqual({ title: 'Orodha yako ya wiki ya kwanza iko tayari', body: 'kazi 5' });
  });
});
