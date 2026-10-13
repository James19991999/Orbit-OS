import 'server-only';
// The four automations. Each step is claimed in automation_log first (unique per kind + record + step), so a step
// runs exactly once even if two job runs overlap or GitHub starts the hourly job late or twice.
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatInTimeZone } from 'date-fns-tz';
import { NEW_MEMBER_TASKS, addDays } from '@/lib/templates';
import { sendEmail, emailLayout, escapeHtml, isEmailConfigured } from '@/lib/email';
import { formatMoney, type Currency } from '@/lib/format';
import { formatDate, localeForCurrency } from '@/lib/locale';
import { isLanguage, makeT, type Language } from '@/i18n';
import { likeExact } from '@/lib/security/request-guard';
import { withDefaults, invoiceStep, overdueSteps, handoverDue, inWorkingWindow, type AutomationSettings } from './rules';

type Kind = 'onboarding' | 'invoice_reminder' | 'overdue_nudge' | 'overdue_escalation' | 'leave_handover';

/** Claims a step. false = already done (or being done) by another run. */
async function claim(admin: SupabaseClient, orgId: string, kind: Kind, refId: string, step: string, detail: Record<string, unknown> = {}) {
  const { error } = await admin.from('automation_log').insert({ org_id: orgId, kind, ref_id: refId, step, detail });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(`automation_log: ${error.message}`);
}
async function unclaim(admin: SupabaseClient, kind: Kind, refId: string, step: string) {
  await admin.from('automation_log').delete().eq('kind', kind).eq('ref_id', refId).eq('step', step);
}
async function notify(admin: SupabaseClient, rows: { org_id: string; user_id: string; kind: string; title: string; body: string | null; link: string }[]) {
  if (!rows.length) return;
  const { error } = await admin.from('notifications').insert(rows);
  if (error) console.error('[automations] notify failed', error.message);
}

export async function loadSettings(admin: SupabaseClient, orgIds: string[]): Promise<Map<string, AutomationSettings>> {
  const out = new Map<string, AutomationSettings>();
  if (!orgIds.length) return out;
  const { data, error } = await admin.from('automation_settings').select('*').in('org_id', orgIds);
  if (error) throw new Error(error.message);
  for (const id of orgIds) out.set(id, withDefaults(data?.find((r) => r.org_id === id)));
  return out;
}

interface Person { id: string; full_name: string; timezone: string | null; language: string | null; email: string | null }
const lang = (p?: Pick<Person, 'language'> | null): Language => (p && isLanguage(p.language) ? p.language : 'en');
const localToday = (tz: string | null | undefined, now: Date) => formatInTimeZone(now, tz || 'UTC', 'yyyy-MM-dd');
const working = (tz: string | null | undefined, now: Date) =>
  inWorkingWindow(Number(formatInTimeZone(now, tz || 'UTC', 'H')), Number(formatInTimeZone(now, tz || 'UTC', 'i')));
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

// ───────── 1. New member → first-week checklist ─────────

/**
 * Creates the new person's first-week tasks (theirs, in their language) and their manager's (whoever invited them,
 * or the owner). Runs right after they accept the invite, and again from the hourly job as a safety net.
 */
export async function runOnboarding(admin: SupabaseClient, membership: { id: string; org_id: string; user_id: string }, now = new Date()) {
  const settings = (await loadSettings(admin, [membership.org_id])).get(membership.org_id)!;
  if (!settings.onboarding) return { created: 0, reason: 'off' as const };
  const [{ data: inv }, { data: org }] = await Promise.all([
    admin.from('invites').select('invited_by, accepted_at').eq('org_id', membership.org_id).not('accepted_at', 'is', null)
      .ilike('email', likeExact((await admin.from('profiles').select('email').eq('id', membership.user_id).single()).data?.email ?? '-'))
      .order('accepted_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('organizations').select('owner_id, status').eq('id', membership.org_id).single(),
  ]);
  if (!inv || !org || org.status !== 'active') return { created: 0, reason: 'not_invited' as const };
  // Only for people who joined recently, never for long-standing members.
  if (Date.parse(inv.accepted_at) < now.getTime() - 7 * 86_400_000) return { created: 0, reason: 'not_new' as const };
  // A manager: the person who sent the invite, if they still run the workspace; otherwise the owner.
  let managerId: string = org.owner_id;
  if (inv.invited_by && inv.invited_by !== membership.user_id) {
    const { data: m } = await admin.from('memberships').select('role').eq('org_id', membership.org_id).eq('user_id', inv.invited_by).eq('status', 'active').maybeSingle();
    if (m && ['owner', 'director'].includes(m.role)) managerId = inv.invited_by;
  }
  if (!(await claim(admin, membership.org_id, 'onboarding', membership.id, 'tasks', { user: membership.user_id, manager: managerId }))) return { created: 0, reason: 'done' as const };
  try {
    const { data: people } = await admin.from('profiles').select('id, full_name, timezone, language, email').in('id', [membership.user_id, managerId]);
    const member = (people ?? []).find((p) => p.id === membership.user_id) as Person | undefined;
    const manager = (people ?? []).find((p) => p.id === managerId) as Person | undefined;
    const name = member?.full_name?.trim() || member?.email?.split('@')[0] || 'new teammate';
    const start = localToday(member?.timezone, now);
    const rows = NEW_MEMBER_TASKS.map((x) => {
      const forManager = x.who === 'manager';
      const l = lang(forManager ? manager : member);
      return {
        org_id: membership.org_id, title: x.title[l].replace('{name}', first(name)), priority: x.priority, points: x.points, tags: x.tags,
        due_on: addDays(start, x.offset), assignee_id: forManager ? managerId : membership.user_id, created_by: managerId,
      };
    });
    const { error } = await admin.rpc('automation_insert_tasks', { p_rows: rows });
    if (error) throw new Error(error.message);
    const mine = rows.filter((r) => r.assignee_id === membership.user_id).length;
    const theirs = rows.length - mine;
    await notify(admin, [
      { org_id: membership.org_id, user_id: membership.user_id, kind: 'onboarding', title: 'Your first-week checklist is ready', body: `${mine} tasks`, link: '/my-day' },
      ...(managerId !== membership.user_id ? [{ org_id: membership.org_id, user_id: managerId, kind: 'onboarding', title: `Onboarding started for ${name}`, body: `${theirs} tasks for you`, link: '/my-day' }] : []),
    ]);
    return { created: rows.length, reason: 'created' as const };
  } catch (e) {
    await unclaim(admin, 'onboarding', membership.id, 'tasks');
    throw e;
  }
}

/** Safety net: anyone who joined by invite in the last 3 days and hasn't had their checklist yet. */
async function onboardingCatchUp(admin: SupabaseClient, now: Date) {
  const since = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const { data: invites } = await admin.from('invites').select('org_id, email').gte('accepted_at', since).limit(500);
  let created = 0;
  for (const i of invites ?? []) {
    const { data: p } = await admin.from('profiles').select('id').ilike('email', likeExact(i.email)).maybeSingle();
    if (!p) continue;
    const { data: m } = await admin.from('memberships').select('id, org_id, user_id, role').eq('org_id', i.org_id).eq('user_id', p.id).eq('status', 'active').maybeSingle();
    if (!m || m.role === 'auditor') continue;
    try { created += (await runOnboarding(admin, m, now)).created; } catch (e) { console.error('[automations] onboarding', (e as Error).message); }
  }
  return created;
}

// ───────── 2. Invoice reminders to clients ─────────

async function invoiceReminders(admin: SupabaseClient, settings: Map<string, AutomationSettings>, now: Date) {
  const on = [...settings].filter(([, s]) => s.invoice_reminders).map(([id]) => id);
  if (!on.length || !isEmailConfigured()) return 0;
  const horizon = addDays(now.toISOString().slice(0, 10), 4);
  const { data: invoices, error } = await admin.from('invoices')
    .select('id, org_id, number, client_name, client_email, amount_minor, currency, due_on, payment_url, created_by, org:organizations(name, legal_name, status)')
    .in('org_id', on).eq('status', 'sent').lte('due_on', horizon).limit(1000);
  if (error) throw new Error(error.message);
  const creators = [...new Set((invoices ?? []).map((i) => i.created_by).filter(Boolean))] as string[];
  const { data: people } = creators.length ? await admin.from('profiles').select('id, full_name, timezone, language, email').in('id', creators) : { data: [] };
  let sent = 0;
  for (const inv of (invoices ?? []) as unknown as {
    id: string; org_id: string; number: string; client_name: string; client_email: string; amount_minor: number; currency: Currency;
    due_on: string; payment_url: string | null; created_by: string | null; org: { name: string; legal_name: string | null; status: string } }[]) {
    if (inv.org?.status !== 'active') continue;
    const sender = (people ?? []).find((p) => p.id === inv.created_by) as Person | undefined;
    const tz = sender?.timezone || 'Africa/Nairobi';
    if (!working(tz, now)) continue;
    const step = invoiceStep(inv.due_on, localToday(tz, now));
    if (!step || !(await claim(admin, inv.org_id, 'invoice_reminder', inv.id, step, { to: inv.client_email }))) continue;
    const l = lang(sender);
    const t = makeT(l);
    const orgName = inv.org.legal_name || inv.org.name;
    const locale = localeForCurrency(inv.currency);
    const amount = formatMoney(inv.amount_minor, inv.currency, { locale });
    const date = formatDate(`${inv.due_on}T12:00:00Z`, 'long', locale, 'UTC', l);
    const late = step === 'after3' || step === 'after7';
    const r = await sendEmail({
      to: inv.client_email,
      subject: t(late ? 'email.rem.subject_late' : step === 'due' ? 'email.rem.subject_due' : 'email.rem.subject_soon', { number: inv.number, org: orgName }),
      html: emailLayout(t('email.inv.title', { number: inv.number }),
        `<p>${escapeHtml(t('email.inv.hello', { name: inv.client_name }))}</p>`
        + `<p>${t(late ? 'email.rem.body_late' : step === 'due' ? 'email.rem.body_due' : 'email.rem.body_soon', { number: escapeHtml(inv.number), org: escapeHtml(orgName), amount: `<strong>${escapeHtml(amount)}</strong>`, date: `<strong>${escapeHtml(date)}</strong>` })}</p>`
        + `<p>${escapeHtml(t(inv.payment_url ? (inv.currency === 'KES' ? 'email.inv.mpesa' : 'email.inv.card') : 'email.inv.bank'))}</p>`
        + `<p>${escapeHtml(t('email.rem.ignore'))}</p>`,
        inv.payment_url ? { label: t('email.inv.cta'), url: inv.payment_url } : undefined, t('email.footer')),
    });
    if (!r.sent) { await unclaim(admin, 'invoice_reminder', inv.id, step); continue; }
    sent++;
    if (inv.created_by) await notify(admin, [{ org_id: inv.org_id, user_id: inv.created_by, kind: 'invoice_reminder', title: `Reminder sent for invoice ${inv.number}`, body: `${inv.client_name} · ${step}`, link: '/operations?tab=finance' }]);
  }
  return sent;
}

// ───────── 3. Overdue nudges and escalation ─────────

async function overdue(admin: SupabaseClient, settings: Map<string, AutomationSettings>, now: Date) {
  const on = [...settings].filter(([, s]) => s.overdue_nudges).map(([id]) => id);
  if (!on.length) return { nudged: 0, escalated: 0 };
  const today = now.toISOString().slice(0, 10);
  const { data: tasks, error } = await admin.from('tasks').select('id, org_id, title, due_on, assignee_id, created_by')
    .in('org_id', on).neq('status', 'done').not('assignee_id', 'is', null).lt('due_on', today).limit(5000);
  if (error) throw new Error(error.message);
  if (!tasks?.length) return { nudged: 0, escalated: 0 };
  const orgIds = [...new Set(tasks.map((x) => x.org_id))];
  const [{ data: members }, { data: orgs }] = await Promise.all([
    admin.from('memberships').select('org_id, user_id, role').in('org_id', orgIds).eq('status', 'active'),
    admin.from('organizations').select('id, status').in('id', orgIds),
  ]);
  const ids = [...new Set((members ?? []).map((m) => m.user_id))];
  const { data: people } = await admin.from('profiles').select('id, full_name, timezone, language, email').in('id', ids);
  const person = (id: string) => (people ?? []).find((p) => p.id === id) as Person | undefined;
  const role = (org: string, user: string) => (members ?? []).find((m) => m.org_id === org && m.user_id === user)?.role;
  const active = new Set((orgs ?? []).filter((o) => o.status === 'active').map((o) => o.id));

  // Collect first, then send one message per person (not one per task).
  const nudges = new Map<string, { org: string; user: string; titles: string[] }>();
  const escalations = new Map<string, { org: string; manager: string; about: string; titles: string[] }>();
  for (const task of tasks) {
    const s = settings.get(task.org_id)!;
    const assignee = person(task.assignee_id!);
    if (!active.has(task.org_id) || !assignee || !role(task.org_id, task.assignee_id!)) continue;
    const today = localToday(assignee.timezone, now);
    const st = overdueSteps(task.due_on!, today, s);
    if (st.nudge && working(assignee.timezone, now) && await claim(admin, task.org_id, 'overdue_nudge', task.id, `due:${task.due_on}`, { late: st.late })) {
      const k = `${task.org_id}:${task.assignee_id}`;
      const n = nudges.get(k) ?? { org: task.org_id, user: task.assignee_id!, titles: [] as string[] };
      n.titles.push(task.title); nudges.set(k, n);
    }
    if (!st.escalate) continue;
    // Who hears about it: the manager who created the task, otherwise the workspace's owners and directors.
    const creatorIsManager = task.created_by && task.created_by !== task.assignee_id && ['owner', 'director'].includes(role(task.org_id, task.created_by) ?? '');
    const managers = creatorIsManager ? [task.created_by!]
      : (members ?? []).filter((m) => m.org_id === task.org_id && ['owner', 'director'].includes(m.role) && m.user_id !== task.assignee_id).map((m) => m.user_id);
    const ready = managers.filter((m) => working(person(m)?.timezone, now));
    if (!ready.length || !(await claim(admin, task.org_id, 'overdue_escalation', task.id, `due:${task.due_on}`, { late: st.late, to: ready }))) continue;
    for (const m of ready) {
      const k = `${task.org_id}:${m}:${task.assignee_id}`;
      const e = escalations.get(k) ?? { org: task.org_id, manager: m, about: task.assignee_id!, titles: [] as string[] };
      e.titles.push(task.title); escalations.set(k, e);
    }
  }
  const list = (titles: string[]) => titles.slice(0, 3).map((x) => `“${x}”`).join(', ') + (titles.length > 3 ? ` +${titles.length - 3}` : '');
  await notify(admin, [...nudges.values()].map((n) => ({
    org_id: n.org, user_id: n.user, kind: 'overdue',
    title: n.titles.length === 1 ? 'A task of yours is overdue' : `${n.titles.length} of your tasks are overdue`, body: list(n.titles), link: '/my-day',
  })));
  await notify(admin, [...escalations.values()].map((e) => {
    const s = settings.get(e.org)!;
    return {
      org_id: e.org, user_id: e.manager, kind: 'escalation',
      title: `${person(e.about)?.full_name || 'A teammate'} has ${e.titles.length} ${e.titles.length === 1 ? 'task' : 'tasks'} over ${s.escalate_after_days} days late`,
      body: list(e.titles), link: `/operations`,
    };
  }));
  return { nudged: nudges.size, escalated: escalations.size };
}

// ───────── 4. Time off → handover reminder ─────────

async function handover(admin: SupabaseClient, settings: Map<string, AutomationSettings>, now: Date) {
  const on = [...settings].filter(([, s]) => s.leave_handover).map(([id]) => id);
  if (!on.length) return 0;
  const today = now.toISOString().slice(0, 10);
  const { data: leaves, error } = await admin.from('leave_requests').select('id, org_id, user_id, starts_on, ends_on, decided_by')
    .in('org_id', on).eq('status', 'approved').is('cover_id', null).gte('ends_on', addDays(today, -1)).lte('starts_on', addDays(today, 4)).limit(1000);
  if (error) throw new Error(error.message);
  let reminded = 0;
  for (const lv of leaves ?? []) {
    const { data: p } = await admin.from('profiles').select('id, full_name, timezone, language, email').eq('id', lv.user_id).single();
    const who = p as Person | null;
    if (!who || !handoverDue(lv.starts_on, lv.ends_on, localToday(who.timezone, now)) || !working(who.timezone, now)) continue;
    const { count } = await admin.from('tasks').select('id', { count: 'exact', head: true })
      .eq('org_id', lv.org_id).eq('assignee_id', lv.user_id).neq('status', 'done').gte('due_on', lv.starts_on).lte('due_on', lv.ends_on);
    if (!count) continue;
    if (!(await claim(admin, lv.org_id, 'leave_handover', lv.id, 'remind', { tasks: count }))) continue;
    const range = `${lv.starts_on} to ${lv.ends_on}`;
    await notify(admin, [
      { org_id: lv.org_id, user_id: lv.user_id, kind: 'handover', title: 'Choose who covers while you’re away', body: `${range} · ${count} tasks`, link: '/people?tab=leave' },
      ...(lv.decided_by && lv.decided_by !== lv.user_id ? [{ org_id: lv.org_id, user_id: lv.decided_by, kind: 'handover', title: `${who.full_name || 'A teammate'} needs cover while away`, body: `${range} · ${count} tasks`, link: '/people?tab=leave' }] : []),
    ]);
    reminded++;
  }
  return reminded;
}

/** The hourly job. Each part is independent: one failing never stops the others. */
export async function runAutomations(admin: SupabaseClient, now = new Date()) {
  const { data: orgs, error } = await admin.from('organizations').select('id').eq('status', 'active').limit(10000);
  if (error) throw new Error(error.message);
  const settings = await loadSettings(admin, (orgs ?? []).map((o) => o.id));
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  const part = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { errors.push(`${name}: ${(e as Error).message}`); console.error('[automations]', name, e); }
  };
  await part('onboarding', () => onboardingCatchUp(admin, now));
  await part('invoiceReminders', () => invoiceReminders(admin, settings, now));
  await part('overdue', () => overdue(admin, settings, now));
  await part('handover', () => handover(admin, settings, now));
  return { ...out, errors };
}
