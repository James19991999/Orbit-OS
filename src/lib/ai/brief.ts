import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatInTimeZone } from 'date-fns-tz';
import { makeT, isLanguage, type Language } from '@/i18n';
import { formatMoney, type Currency } from '@/lib/format';
import { localeForCurrency } from '@/lib/locale';
import { sendEmail, emailLayout, escapeHtml, isEmailConfigured } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { linkedUsers } from '@/lib/whatsapp/outbound';
import { sendTemplate, TEMPLATES } from '@/lib/whatsapp/client';
import { complete, isAIConfigured, aiModel } from './client';
import { ruleBrief, briefPrompt, headline, tidy, type BriefFacts, type BriefKind } from './compose';

type Admin = SupabaseClient;
const DAY = 86_400_000;
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const first = (n: string) => n.split(' ')[0] || n;

/** Period key: ISO week ("2026-W41") for weekly briefs, the local date for check-in summaries. */
export function periodKey(kind: BriefKind, tz: string, now = new Date()): string {
  return kind === 'weekly' ? formatInTimeZone(now, tz, "RRRR-'W'II") : formatInTimeZone(now, tz, 'yyyy-MM-dd');
}

/** Collects the facts for one workspace. Weekly = the last 7 days; check-ins = today in `tz`. */
export async function gatherFacts(admin: Admin, org: { id: string; name: string }, kind: BriefKind, tz: string, now = new Date()): Promise<BriefFacts> {
  const today = formatInTimeZone(now, tz, 'yyyy-MM-dd');
  const since = kind === 'weekly' ? formatInTimeZone(new Date(now.getTime() - 6 * DAY), tz, 'yyyy-MM-dd') : today;
  const prevSince = formatInTimeZone(new Date(now.getTime() - 13 * DAY), tz, 'yyyy-MM-dd');
  const sinceTs = new Date(now.getTime() - 7 * DAY).toISOString();

  const [{ data: mem }, { data: cis }, { data: prev }] = await Promise.all([
    admin.from('memberships').select('user_id, role, profile:profiles(full_name)').eq('org_id', org.id).eq('status', 'active').in('role', ['owner', 'director', 'contributor']),
    admin.from('check_ins').select('user_id, for_date, shipped, blockers, mood').eq('org_id', org.id).gte('for_date', since).lte('for_date', today).order('for_date'),
    kind === 'weekly' ? admin.from('check_ins').select('mood').eq('org_id', org.id).gte('for_date', prevSince).lt('for_date', since) : Promise.resolve({ data: [] as { mood: number }[] }),
  ]);
  const names = new Map(((mem ?? []) as unknown as { user_id: string; profile: { full_name: string } | null }[]).map((m) => [m.user_id, m.profile?.full_name || 'Teammate']));
  const rows = (cis ?? []) as { user_id: string; for_date: string; shipped: string; blockers: string | null; mood: number }[];
  const active = new Set(rows.map((r) => r.user_id));
  const facts: BriefFacts = {
    kind, org: org.name,
    period: kind === 'weekly' ? `Week ${formatInTimeZone(now, tz, 'II')}` : today,
    members: names.size, checkins: rows.length, people: active.size,
    mood: avg(rows.map((r) => r.mood)), prevMood: kind === 'weekly' ? avg((prev ?? []).map((r) => r.mood)) : null,
    // Most recent first, one per person per day already (unique constraint)
    shipped: rows.slice().reverse().slice(0, 25).map((r) => ({ name: first(names.get(r.user_id) ?? 'Teammate'), text: r.shipped })),
    blockers: rows.filter((r) => r.blockers?.trim()).slice(-12).map((r) => ({ name: first(names.get(r.user_id) ?? 'Teammate'), text: r.blockers! })),
    quiet: [...names.entries()].filter(([id]) => !active.has(id)).map(([, n]) => n).slice(0, 12),
    tasksDone: 0, blockedTasks: [], overdue: 0, pendingExpenses: { count: 0, total: '' }, payoutsPaid: null, failingControls: 0,
  };
  if (kind === 'checkins') return facts;

  const [done, blocked, overdue, pending, runs, failing] = await Promise.all([
    admin.from('tasks').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'done').gte('completed_at', sinceTs),
    admin.from('tasks').select('title, blocked_reason').eq('org_id', org.id).eq('status', 'blocked').limit(6),
    admin.from('tasks').select('id', { count: 'exact', head: true }).eq('org_id', org.id).neq('status', 'done').lt('due_on', today),
    admin.from('finance_entries').select('amount_minor, currency').eq('org_id', org.id).eq('approval_status', 'pending'),
    admin.from('payroll_runs').select('total_minor, currency').eq('org_id', org.id).eq('provider_label', 'M-Pesa (IntaSend)').gte('paid_on', since),
    admin.from('compliance_controls').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'failing'),
  ]);
  const money = (list: { amount_minor?: number; total_minor?: number; currency: string }[]) => {
    const by = new Map<string, number>();
    for (const r of list) by.set(r.currency, (by.get(r.currency) ?? 0) + Number(r.amount_minor ?? r.total_minor ?? 0));
    return [...by.entries()].map(([c, v]) => formatMoney(v, c as Currency, { locale: localeForCurrency(c as Currency) })).join(' + ');
  };
  facts.tasksDone = done.count ?? 0;
  facts.blockedTasks = (blocked.data ?? []).map((b) => ({ title: b.title as string, reason: (b.blocked_reason as string | null) ?? null }));
  facts.overdue = overdue.count ?? 0;
  facts.pendingExpenses = { count: pending.data?.length ?? 0, total: money(pending.data ?? []) };
  facts.payoutsPaid = runs.data?.length ? money(runs.data) : null;
  facts.failingControls = failing.count ?? 0;
  return facts;
}

/** Claude when configured (falls back to the rule-based summary on any error). */
export async function writeBrief(facts: BriefFacts, lang: Language, useAI: boolean): Promise<{ content: string; source: 'ai' | 'rules'; model: string | null }> {
  if (useAI && isAIConfigured()) {
    try {
      const { system, prompt } = briefPrompt(facts, lang);
      return { content: tidy(await complete({ system, prompt, maxTokens: 900 })), source: 'ai', model: aiModel() };
    } catch (e) {
      console.error('[ai-brief] Claude failed, using the rule-based summary:', (e as Error).message);
    }
  }
  return { content: ruleBrief(facts, lang), source: 'rules', model: null };
}

export interface StoredBrief { id: string; content: string; source: string; kind: BriefKind; period_key: string; created_at: string; language: string; model: string | null }

/** Writes (or replaces) the brief for this person and period. */
export async function saveBrief(admin: Admin, row: { org_id: string; user_id: string; kind: BriefKind; period_key: string; language: Language; content: string; source: 'ai' | 'rules'; model: string | null }, opts: { onlyIfNew?: boolean } = {}): Promise<StoredBrief | null> {
  const { data, error } = await admin.from('ai_briefs').upsert({ ...row, created_at: new Date().toISOString() }, { onConflict: 'org_id,user_id,kind,period_key', ignoreDuplicates: !!opts.onlyIfNew })
    .select('id, content, source, kind, period_key, created_at, language, model');
  if (error) throw new Error(error.message);
  return (data?.[0] as StoredBrief | undefined) ?? null;
}

/** Email + WhatsApp + in-app notification for a weekly brief. Each channel is best-effort. */
export async function deliverBrief(admin: Admin, orgId: string, orgName: string, person: { id: string; email: string | null; full_name: string; language: string | null }, content: string) {
  const lang: Language = isLanguage(person.language) ? person.language : 'en';
  const t = makeT(lang);
  const head = headline(content, 200);
  const link = `${appUrl()}/dashboard#chief-of-staff`;
  const out = { email: false, whatsapp: false };
  await admin.from('notifications').insert({ org_id: orgId, user_id: person.id, kind: 'ai_brief', title: t('ai.kind.weekly'), body: head, link: '/dashboard#chief-of-staff' });
  if (isEmailConfigured() && person.email) {
    const html = escapeHtml(content).split('\n').map((l) => (l.trim() ? `<p style="margin:0 0 6px">${l}</p>` : '')).join('');
    const r = await sendEmail({ to: person.email, subject: t('email.brief.subject', { org: orgName }), html: emailLayout(t('ai.kind.weekly'), html, { label: t('email.brief.cta'), url: link }) }).catch(() => ({ sent: false }));
    out.email = !!r.sent;
  }
  const wa = (await linkedUsers(admin, [person.id])).get(person.id);
  if (wa && (wa.checkins || wa.approvals)) {
    try { await sendTemplate(wa.phone, TEMPLATES.brief, wa.language, [wa.firstName, orgName, head]); out.whatsapp = true; } catch (e) { console.error('[ai-brief] WhatsApp failed', (e as Error).message); }
  }
  return out;
}
