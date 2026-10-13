import 'server-only';
// Founder-side automations: trial follow-up emails, lapsed and failed payment follow-up, and the weekly founder email.
// Each email is claimed in lifecycle_log first, so it goes out exactly once even if the hourly job runs twice.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { formatInTimeZone } from 'date-fns-tz';
import { sendEmail, emailLayout, escapeHtml, isEmailConfigured } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { formatMoney, type Currency } from '@/lib/format';
import { formatDate } from '@/lib/locale';
import { isLanguage, makeT, type Language } from '@/i18n';
import { parseFounderEmails } from '@/lib/founder/emails';
import { PLANS } from '@/lib/billing/plans';
import { trialStep, lapsedStep, isoWeek, type TrialStep } from './rules';

type Kind = 'trial' | 'billing' | 'founder_weekly';
async function claim(admin: SupabaseClient, kind: Kind, ref: string, step: string, orgId: string | null, detail: Record<string, unknown> = {}) {
  const { error } = await admin.from('lifecycle_log').insert({ kind, ref, step, org_id: orgId, detail });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(`lifecycle_log: ${error.message}`);
}
const unclaim = (admin: SupabaseClient, kind: Kind, ref: string, step: string) => admin.from('lifecycle_log').delete().eq('kind', kind).eq('ref', ref).eq('step', step);

// ───────── Unsubscribe links (signed, so nobody can switch off someone else's emails) ─────────
function linkSecret() {
  const s = process.env.EMAIL_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('No secret available for email links');
  return s;
}
export function unsubscribeSig(userId: string) {
  return createHmac('sha256', linkSecret()).update(`unsub:${userId}`).digest('base64url').slice(0, 32);
}
export function verifyUnsubscribe(userId: string, sig: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId) || typeof sig !== 'string' || sig.length !== 32) return false;
  const want = Buffer.from(unsubscribeSig(userId)); const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
const unsubscribeLink = (userId: string, label: string) =>
  `<a href="${escapeHtml(`${appUrl()}/api/email/unsubscribe?u=${userId}&s=${unsubscribeSig(userId)}`)}" style="color:#64748b">${escapeHtml(label)}</a>`;

interface Owner { id: string; full_name: string; email: string | null; timezone: string | null; language: string | null; product_emails: boolean }
interface Org { id: string; name: string; slug: string; plan: keyof typeof PLANS; plan_period: string; plan_expires_at: string; created_at: string; owner_id: string; status: string }
const lang = (o?: Owner | null): Language => (o && isLanguage(o.language) ? o.language : 'en');
const working = (tz: string | null | undefined, now: Date) => {
  const h = Number(formatInTimeZone(now, tz || 'Africa/Nairobi', 'H')); const d = Number(formatInTimeZone(now, tz || 'Africa/Nairobi', 'i'));
  return d <= 5 && h >= 9 && h < 17;
};
const first = (n: string) => n.trim().split(/\s+/)[0] || n;
const list = (items: string[]) => `<ul style="padding-left:18px;margin:12px 0">${items.map((i) => `<li style="margin:4px 0">${i}</li>`).join('')}</ul>`;

async function owners(admin: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, Owner>();
  const { data } = await admin.from('profiles').select('id, full_name, email, timezone, language, product_emails').in('id', ids);
  return new Map(((data ?? []) as Owner[]).map((o) => [o.id, o]));
}

/** How far a workspace has got: used to pick what the next email should talk about. */
async function progress(admin: SupabaseClient, orgId: string) {
  const [m, tk, ci, mt] = await Promise.all([
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    admin.from('tasks').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    admin.from('check_ins').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    admin.from('meetings').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
  ]);
  return { members: m.count ?? 0, tasks: tk.count ?? 0, checkins: ci.count ?? 0, meetings: mt.count ?? 0 };
}

// ───────── 1. Trial follow-up ─────────

async function trialEmails(admin: SupabaseClient, now: Date) {
  const { data, error } = await admin.from('organizations').select('id, name, slug, plan, plan_period, plan_expires_at, created_at, owner_id, status')
    .eq('status', 'active').eq('plan_period', 'trial').gt('plan_expires_at', new Date(now.getTime() - 86_400_000).toISOString()).limit(2000);
  if (error) throw new Error(error.message);
  const orgs = (data ?? []) as Org[];
  const people = await owners(admin, [...new Set(orgs.map((o) => o.owner_id))]);
  let sent = 0;
  for (const org of orgs) {
    const o = people.get(org.owner_id);
    if (!o?.email || !working(o.timezone, now)) continue;
    const tz = o.timezone || 'Africa/Nairobi';
    const step = trialStep(formatInTimeZone(new Date(org.created_at), tz, 'yyyy-MM-dd'), formatInTimeZone(new Date(org.plan_expires_at), tz, 'yyyy-MM-dd'), formatInTimeZone(now, tz, 'yyyy-MM-dd'));
    if (!step) continue;
    // Tips respect the person's choice; the "trial is ending" notice is about their account, so it always goes.
    if (step !== 'ending' && o.product_emails === false) continue;
    if (!(await claim(admin, 'trial', org.id, step, org.id))) continue;
    const r = await sendEmail({ to: o.email, ...trialEmail(step, org, o, await progress(admin, org.id), now) });
    if (!r.sent) { await unclaim(admin, 'trial', org.id, step); continue; }
    sent++;
  }
  return sent;
}

function trialEmail(step: TrialStep, org: Org, o: Owner, p: Awaited<ReturnType<typeof progress>>, now: Date) {
  const l = lang(o); const t = makeT(l); const base = appUrl();
  const name = first(o.full_name || '');
  const hello = `<p>${escapeHtml(t('email.trial.hello', { name: name || t('email.trial.there') }))}</p>`;
  const footer = [t('email.footer'), unsubscribeLink(o.id, t('email.unsubscribe'))] as const;
  const ends = formatDate(org.plan_expires_at, 'long', l === 'en' ? 'en-KE' : l === 'sw' ? 'sw-KE' : 'fr-FR', o.timezone || 'Africa/Nairobi', l);
  const stats = list([t('email.trial.stat_members', { count: p.members }), t('email.trial.stat_tasks', { count: p.tasks }), t('email.trial.stat_checkins', { count: p.checkins }), t('email.trial.stat_meetings', { count: p.meetings })].map(escapeHtml));
  if (step === 'd1') return {
    subject: t('email.trial.d1_subject', { org: org.name }),
    html: emailLayout(t('email.trial.d1_title'), hello + `<p>${escapeHtml(t('email.trial.d1_body'))}</p>`
      + list([t('email.trial.d1_a'), t('email.trial.d1_b'), t('email.trial.d1_c')].map(escapeHtml)), { label: t('email.trial.d1_cta'), url: `${base}/settings#members` }, ...footer),
  };
  if (step === 'd3') {
    const solo = p.members <= 1;
    return {
      subject: t(solo ? 'email.trial.d3_subject_solo' : 'email.trial.d3_subject_team', { org: org.name }),
      html: emailLayout(t(solo ? 'email.trial.d3_title_solo' : 'email.trial.d3_title_team'), hello + `<p>${escapeHtml(t(solo ? 'email.trial.d3_body_solo' : 'email.trial.d3_body_team'))}</p>`,
        solo ? { label: t('email.trial.d1_cta'), url: `${base}/settings#members` } : { label: t('email.trial.d3_cta_team'), url: `${base}/culture` }, ...footer),
    };
  }
  if (step === 'd7') return {
    subject: t('email.trial.d7_subject', { org: org.name }),
    html: emailLayout(t('email.trial.d7_title'), hello + `<p>${escapeHtml(t('email.trial.d7_body'))}</p>` + stats + `<p>${escapeHtml(t('email.trial.d7_tip'))}</p>`,
      { label: t('email.trial.d7_cta'), url: `${base}/settings#automations` }, ...footer),
  };
  void now;
  return {
    subject: t('email.trial.end_subject', { org: org.name, date: ends }),
    html: emailLayout(t('email.trial.end_title', { date: ends }), hello + `<p>${escapeHtml(t('email.trial.end_body', { date: ends }))}</p>` + stats
      + `<p>${escapeHtml(t('email.trial.end_plans', { price: formatMoney(PLANS.starter.monthly.KES, 'KES') }))}</p>`,
      { label: t('email.trial.end_cta'), url: `${base}/settings/billing` }, t('email.footer')),
  };
}

// ───────── 2. Lapsed plans and failed payments ─────────

async function billingEmails(admin: SupabaseClient, now: Date) {
  let sent = 0;
  // Plans that ran out in the last 35 days: the workspace is read-only until renewed.
  const { data: lapsed, error } = await admin.from('organizations').select('id, name, slug, plan, plan_period, plan_expires_at, created_at, owner_id, status')
    .eq('status', 'active').lt('plan_expires_at', now.toISOString()).gt('plan_expires_at', new Date(now.getTime() - 35 * 86_400_000).toISOString()).limit(2000);
  if (error) throw new Error(error.message);
  const orgs = (lapsed ?? []) as Org[];
  const people = await owners(admin, [...new Set(orgs.map((o) => o.owner_id))]);
  for (const org of orgs) {
    const o = people.get(org.owner_id);
    if (!o?.email || !working(o.timezone, now)) continue;
    const step = lapsedStep(org.plan_expires_at, now);
    if (!step) continue;
    const ref = `${org.id}:${org.plan_expires_at.slice(0, 10)}`;   // a later lapse starts the sequence again
    if (!(await claim(admin, 'billing', ref, step, org.id))) continue;
    const t = makeT(lang(o));
    const trial = org.plan_period === 'trial';
    const r = await sendEmail({
      to: o.email,
      subject: t(trial ? 'email.lapsed.subject_trial' : 'email.lapsed.subject_plan', { org: org.name }),
      html: emailLayout(t(trial ? 'email.lapsed.title_trial' : 'email.lapsed.title_plan'),
        `<p>${escapeHtml(t('email.trial.hello', { name: first(o.full_name || '') || t('email.trial.there') }))}</p><p>${escapeHtml(t('email.lapsed.body', { org: org.name }))}</p><p>${escapeHtml(t(step === 'l30' ? 'email.lapsed.last' : 'email.lapsed.mpesa'))}</p>`,
        { label: t('email.lapsed.cta'), url: `${appUrl()}/settings/billing` }, t('email.footer')),
    });
    if (!r.sent) { await unclaim(admin, 'billing', ref, step); continue; }
    sent++;
  }
  // Failed M-Pesa or card payments in the last 3 days: only the latest attempt per workspace is followed up.
  const since = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const { data: failed } = await admin.from('billing_payments').select('id, org_id, created_by, created_at, amount_minor, currency, method, plan, org:organizations(name, owner_id, status)')
    .eq('state', 'FAILED').gte('created_at', since).limit(500);
  for (const f of (failed ?? []) as unknown as { id: string; org_id: string; created_by: string | null; created_at: string; amount_minor: number; currency: Currency; method: string; plan: keyof typeof PLANS; org: { name: string; owner_id: string; status: string } }[]) {
    if (f.org?.status !== 'active') continue;
    const { count: newer } = await admin.from('billing_payments').select('id', { count: 'exact', head: true }).eq('org_id', f.org_id).gt('created_at', f.created_at);   // any newer attempt (paid, in progress or failed again) supersedes this one
    if (newer) continue;
    const to = (await owners(admin, [f.created_by ?? f.org.owner_id])).get(f.created_by ?? f.org.owner_id);
    if (!to?.email || !(await claim(admin, 'billing', f.id, 'failed', f.org_id))) continue;
    const t = makeT(lang(to));
    const r = await sendEmail({
      to: to.email,
      subject: t('email.payfail.subject', { org: f.org.name }),
      html: emailLayout(t('email.payfail.title'),
        `<p>${escapeHtml(t('email.payfail.body', { amount: formatMoney(f.amount_minor, f.currency), plan: PLANS[f.plan]?.name ?? f.plan }))}</p>`
        + (f.method === 'MPESA' ? list([t('email.payfail.r1'), t('email.payfail.r2'), t('email.payfail.r3')].map(escapeHtml)) : `<p>${escapeHtml(t('email.payfail.card'))}</p>`),
        { label: t('email.payfail.cta'), url: `${appUrl()}/settings/billing` }, t('email.footer')),
    });
    if (!r.sent) { await unclaim(admin, 'billing', f.id, 'failed'); continue; }
    sent++;
  }
  return sent;
}

// ───────── 3 + 4. At-risk customers and the weekly founder email ─────────

export interface AtRisk { id: string; name: string; slug: string; plan: string; plan_period: string; plan_expires_at: string; created_at: string;
  members: number; last_active: string | null; reason: 'payment_failed' | 'lapsed' | 'quiet' | 'no_team'; owner_name: string | null; owner_email: string | null }

/** Customers worth a call. The founder's own workspaces are left out. */
export async function atRisk(admin: SupabaseClient): Promise<AtRisk[]> {
  const { data, error } = await admin.rpc('platform_at_risk');
  if (error) throw new Error(error.message);
  const mine = parseFounderEmails(process.env.FOUNDER_EMAILS);
  return ((data ?? []) as AtRisk[]).filter((r) => !mine.includes((r.owner_email ?? '').toLowerCase()));
}
export { RISK_LABEL } from './labels';
import { RISK_LABEL } from './labels';

/** The weekly summary: sign-ups, money, trials ending, customers to call, unanswered help questions, platform health. */
async function buildFounderWeekly(admin: SupabaseClient, now: Date, week: string) {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [{ data: m }, risk, { data: pays }, { data: qs }] = await Promise.all([
    admin.rpc('platform_metrics'),
    atRisk(admin),
    admin.from('billing_payments').select('amount_minor, currency').eq('state', 'COMPLETE').gte('created_at', since),
    admin.from('help_questions').select('question, answered').gte('created_at', since).order('created_at', { ascending: false }).limit(50),
  ]);
  const metrics = (m ?? {}) as { new_workspaces_7d?: number; new_users_7d?: number; paying?: number; on_trial?: number; lapsed?: number; active_7d?: number;
    trials_ending?: { name: string; plan_expires_at: string }[]; failed_payments_7d?: unknown[]; mrr?: { currency: string; amount_minor: number }[];
    jobs?: { job: string; last_status: number | null; failures: number }[]; delivery_failures_24h?: Record<string, number> };
  const revenue = new Map<string, number>();
  for (const p of pays ?? []) revenue.set(p.currency, (revenue.get(p.currency) ?? 0) + Number(p.amount_minor));
  const money = (rows: Iterable<[string, number]>) => [...rows].map(([c, a]) => formatMoney(a, c as Currency)).join(' + ') || '0';
  const broken = (metrics.jobs ?? []).filter((j) => (j.last_status ?? 200) >= 400).map((j) => j.job);
  const unanswered = (qs ?? []).filter((q) => !q.answered).slice(0, 5).map((q) => `“${q.question}”`);
  const row = (k: string, v: string | number) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(String(v))}</td></tr>`;
  const html = emailLayout(`Your week at OrbitOS · ${week}`,
    `<table role="presentation" cellpadding="0" cellspacing="0">${
      row('New workspaces', metrics.new_workspaces_7d ?? 0) + row('New people', metrics.new_users_7d ?? 0) + row('Active people (7 days)', metrics.active_7d ?? 0)
      + row('Paying workspaces', metrics.paying ?? 0) + row('On trial', metrics.on_trial ?? 0) + row('Lapsed', metrics.lapsed ?? 0)
      + row('Revenue this week', money(revenue)) + row('Monthly recurring revenue', money((metrics.mrr ?? []).map((x) => [x.currency, x.amount_minor])))
      + row('Failed payments (7 days)', (metrics.failed_payments_7d ?? []).length) + row('Help questions asked', (qs ?? []).length)}</table>`
    + (metrics.trials_ending?.length ? `<h2 style="font-size:15px;margin:20px 0 4px">Trials ending this week</h2>${list(metrics.trials_ending.slice(0, 10).map((x) => `${escapeHtml(x.name)} · ${escapeHtml(x.plan_expires_at.slice(0, 10))}`))}` : '')
    + (risk.length ? `<h2 style="font-size:15px;margin:20px 0 4px">Customers to call (${risk.length})</h2>${list(risk.slice(0, 10).map((r) => `<strong>${escapeHtml(r.name)}</strong> — ${escapeHtml(RISK_LABEL[r.reason])}${r.owner_email ? ` · <a href="mailto:${escapeHtml(r.owner_email)}">${escapeHtml(r.owner_name || r.owner_email)}</a>` : ''}`))}` : '')
    + (unanswered.length ? `<h2 style="font-size:15px;margin:20px 0 4px">Questions the help centre couldn’t answer</h2>${list(unanswered.map(escapeHtml))}` : '')
    + `<h2 style="font-size:15px;margin:20px 0 4px">Platform health</h2><p>${broken.length ? `Background jobs failing on their last run: ${escapeHtml(broken.join(', '))}.` : 'All background jobs succeeded on their last run.'}${
      Object.values(metrics.delivery_failures_24h ?? {}).some(Boolean) ? ` Undelivered messages in the last 24 h: ${escapeHtml(Object.entries(metrics.delivery_failures_24h ?? {}).map(([k, v]) => `${k} ${v}`).join(', '))}.` : ''}</p>`,
    { label: 'Open the Founder Console', url: `${appUrl()}/founder` }, 'Sent to the addresses in FOUNDER_EMAILS every Monday.');
  return { subject: `OrbitOS weekly: ${metrics.new_workspaces_7d ?? 0} new, ${risk.length} to call, ${money(revenue)} in`, html };
}

/** Scheduled: Monday from 08:00 in the founder's time zone (FOUNDER_TIMEZONE, default Nairobi), once per week. */
async function founderWeekly(admin: SupabaseClient, now: Date) {
  const to = parseFounderEmails(process.env.FOUNDER_EMAILS);
  if (!to.length) return 0;
  const tz = process.env.FOUNDER_TIMEZONE || 'Africa/Nairobi';
  if (formatInTimeZone(now, tz, 'i') !== '1' || Number(formatInTimeZone(now, tz, 'H')) < 8) return 0;
  const week = isoWeek(formatInTimeZone(now, tz, 'yyyy-MM-dd'));
  if (!(await claim(admin, 'founder_weekly', week, 'sent', null))) return 0;
  try {
    const r = await sendEmail({ to, ...(await buildFounderWeekly(admin, now, week)) });
    if (!r.sent) { await unclaim(admin, 'founder_weekly', week, 'sent'); return 0; }
    return 1;
  } catch (e) {
    await unclaim(admin, 'founder_weekly', week, 'sent');
    throw e;
  }
}

/** "Email me this week's summary" from the Founder Console: same email, any day. */
export async function sendFounderWeeklyNow(admin: SupabaseClient, now = new Date()) {
  const to = parseFounderEmails(process.env.FOUNDER_EMAILS);
  if (!to.length) return { sent: false, to: 0 };
  const tz = process.env.FOUNDER_TIMEZONE || 'Africa/Nairobi';
  const r = await sendEmail({ to, ...(await buildFounderWeekly(admin, now, isoWeek(formatInTimeZone(now, tz, 'yyyy-MM-dd')))) });
  return { sent: r.sent, to: to.length, reason: r.reason };
}

/** The hourly job. Each part is independent: one failing never stops the others. */
export async function runGrowth(admin: SupabaseClient, now = new Date()) {
  if (!isEmailConfigured()) return { skipped: 'email not configured', errors: [] as string[] };
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  const part = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { errors.push(`${name}: ${(e as Error).message}`); console.error('[lifecycle]', name, e); }
  };
  await part('trial', () => trialEmails(admin, now));
  await part('billing', () => billingEmails(admin, now));
  await part('founderWeekly', () => founderWeekly(admin, now));
  return { ...out, errors };
}
