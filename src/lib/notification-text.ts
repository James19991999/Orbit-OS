// Notifications are stored with English text (some are written by database triggers). This turns the known
// shapes into the reader's language at display time; anything unrecognised is shown as stored.
import type { MessageKey, T } from '@/i18n/shared';

const PLAN: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };

export function localizeNotification(n: { kind: string; title: string; body: string | null }, t: T): { title: string; body: string | null } {
  let m: RegExpMatchArray | null;
  switch (n.kind) {
    case 'task_assigned':
      return { title: t('notif.k.task_assigned'), body: n.body };
    case 'mention':
    case 'task_comment':
      m = n.title.match(/^(.*) (?:mentioned you on|commented on) “(.*)”$/);
      return { title: m ? t(n.kind === 'mention' ? 'notif.k.mention' : 'notif.k.task_comment', { name: m[1] === 'A teammate' ? t('notif.k.teammate') : m[1]!, title: m[2]! }) : n.title, body: n.body };
    case 'leave_request':
    case 'leave_decided': {
      const b = n.body?.match(/^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2}) · (\d+) days$/);
      const body = b ? t('notif.k.leave_body', { from: b[1]!, to: b[2]!, days: t(Number(b[3]) === 1 ? 'lv.days_one' : 'lv.days', { count: Number(b[3]) }) }) : n.body;
      if (n.kind === 'leave_decided') return { title: t(/approved/.test(n.title) ? 'notif.k.leave_approved' : 'notif.k.leave_declined'), body };
      m = n.title.match(/^(.*) requested time off$/);
      return { title: m ? t('notif.k.leave_request', { name: m[1] === 'A teammate' ? t('notif.k.teammate') : m[1]! }) : n.title, body };
    }
    case 'kudos':
      m = n.title.match(/^(.*) sent you kudos$/);
      return { title: m ? t('notif.k.kudos', { name: m[1] === 'A teammate' ? t('notif.k.teammate') : m[1]! }) : n.title, body: n.body };
    case 'payment': {
      const b = n.body?.match(/^(\w+) plan active until (.+)$/);
      return { title: t('notif.k.payment'), body: b ? t('notif.k.payment_body', { plan: PLAN[b[1]!.toLowerCase()] ?? b[1]!, date: b[2]! }) : n.body };
    }
    case 'invoice_paid':
      m = n.title.match(/^Invoice (.+) paid$/);
      return { title: m ? t('notif.k.invoice_paid', { number: m[1]! }) : n.title, body: n.body };
    case 'renewal':
      if ((m = n.title.match(/^(.+) plan ends today$/))) return { title: t('notif.k.renewal_today', { plan: m[1]! }), body: t('notif.k.renewal_body') };
      if ((m = n.title.match(/^(.+) plan ends in (\d+) days$/))) return { title: t('notif.k.renewal_days', { plan: m[1]!, n: m[2]! }), body: t('notif.k.renewal_body') };
      return n;
    case 'seats':
      m = n.title.match(/^(\d+) of (\d+) seats used$/);
      return m ? { title: t('notif.k.seats', { used: m[1]!, limit: m[2]! }), body: t('notif.k.seats_body') } : n;
    case 'payout': {
      m = n.title.match(/^Payout "(.+)" (completed|finished with failures)$/);
      const b = n.body?.match(/^(\d+) paid, (\d+) failed$/);
      return { title: m ? t(m[2] === 'completed' ? 'notif.k.payout_done' : 'notif.k.payout_failed', { title: m[1]! }) : n.title,
        body: b ? t('notif.k.payout_body', { sent: b[1]!, failed: b[2]! }) : n.body };
    }
    case 'etims':
      m = n.title.match(/^KRA rejected (the credit note for|invoice) (.+)$/);
      return { title: m ? t(m[1] === 'invoice' ? 'notif.k.etims_invoice' : 'notif.k.etims_credit', { number: m[2]! }) : n.title, body: n.body };
    case 'onboarding':
      if (n.title === 'Your first-week checklist is ready') return { title: t('notif.k.onb_member'), body: countBody(n.body, /^(\d+) tasks$/, 'notif.k.n_tasks', t) };
      m = n.title.match(/^Onboarding started for (.+)$/);
      return { title: m ? t('notif.k.onb_manager', { name: m[1]! }) : n.title, body: countBody(n.body, /^(\d+) tasks for you$/, 'notif.k.n_tasks_you', t) };
    case 'overdue': {
      const c = n.title === 'A task of yours is overdue' ? 1 : Number(n.title.match(/^(\d+) of your tasks are overdue$/)?.[1] ?? NaN);
      return { title: Number.isNaN(c) ? n.title : t('notif.k.overdue', { count: c }), body: n.body };
    }
    case 'escalation':
      m = n.title.match(/^(.*) has (\d+) tasks? over (\d+) days late$/);
      return { title: m ? t('notif.k.escalation', { name: m[1] === 'A teammate' ? t('notif.k.teammate') : m[1]!, count: Number(m[2]), days: m[3]! }) : n.title, body: n.body };
    case 'invoice_reminder': {
      m = n.title.match(/^Reminder sent for invoice (.+)$/);
      const b = n.body?.match(/^(.*) · (before3|due|after3|after7)$/);
      return { title: m ? t('notif.k.inv_rem', { number: m[1]! }) : n.title, body: b ? `${b[1]} · ${t(`auto.step.${b[2]}` as MessageKey)}` : n.body };
    }
    case 'handover':
    case 'leave_cover': {
      const b = n.body?.match(/^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2}) · (\d+) tasks$/);
      const body = b ? t('notif.k.ho_body', { from: b[1]!, to: b[2]!, count: Number(b[3]) }) : n.body;
      if (n.kind === 'leave_cover') {
        m = n.title.match(/^(.*) asked you to cover$/);
        return { title: m ? t('notif.k.cover', { name: m[1] === 'A teammate' ? t('notif.k.teammate') : m[1]! }) : n.title, body };
      }
      if (n.title === 'Choose who covers while you’re away') return { title: t('notif.k.ho_self'), body };
      m = n.title.match(/^(.*) needs cover while away$/);
      return { title: m ? t('notif.k.ho_manager', { name: m[1] === 'A teammate' ? t('notif.k.teammate') : m[1]! }) : n.title, body };
    }
    default:
      return n;
  }
}

function countBody(body: string | null, re: RegExp, key: MessageKey, t: T): string | null {
  const c = body?.match(re);
  return c ? t(key, { count: Number(c[1]) }) : body;
}

/** Activity-stream titles (written in English by database triggers and the GitHub webhook). */
export function localizeActivity(e: { kind: string; title: string }, t: T): string {
  let m: RegExpMatchArray | null;
  switch (e.kind) {
    case 'task_done': return (m = e.title.match(/^Completed “(.+)”$/)) ? t('act.task_done', { title: m[1]! }) : e.title;
    case 'checkin': return e.title === 'Submitted async check-in' ? t('act.checkin') : e.title;
    case 'kudos': return (m = e.title.match(/^Gave kudos to (.+)$/)) ? t('act.kudos', { name: m[1] === 'a teammate' ? t('act.teammate') : m[1]! }) : e.title;
    case 'expense_approved': return (m = e.title.match(/^Approved (.+)$/)) ? t('act.expense', { what: m[1] === 'an expense' ? t('act.an_expense') : m[1]! }) : e.title;
    case 'invoice_paid': return (m = e.title.match(/^Invoice (.+) paid$/)) ? t('notif.k.invoice_paid', { number: m[1]! }) : e.title;
    case 'github_pr_merged': return (m = e.title.match(/^Merged PR #(\d+) in (.+?): (.*)$/)) ? t('act.pr', { n: m[1]!, repo: m[2]!, title: m[3]! }) : e.title;
    case 'github_push': return (m = e.title.match(/^Pushed (\d+) commits? to (.+)$/)) ? t('act.push', { count: Number(m[1]), target: m[2]! }) : e.title;
    default: return e.title;
  }
}
