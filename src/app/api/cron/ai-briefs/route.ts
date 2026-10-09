import { formatInTimeZone } from 'date-fns-tz';
import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { isLanguage, type Language } from '@/i18n';
import { gatherFacts, writeBrief, saveBrief, deliverBrief, periodKey } from '@/lib/ai/brief';
import type { BriefFacts } from '@/lib/ai/compose';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Row = { org_id: string; user_id: string; org: { name: string; status: string; ai_enabled: boolean }; profile: { full_name: string; email: string | null; timezone: string; language: string | null } };

/**
 * Hourly: at 08:00 on Monday in each owner's/director's own time zone, writes their weekly brief
 * (once per ISO week — the unique index makes re-runs harmless) and delivers it by email, WhatsApp and in-app.
 * `?at=<ISO time>` simulates another moment (cron secret required, used by tests).
 */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  const at = req.nextUrl.searchParams.get('at');
  const now = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date();
  const admin = getAdminClient();
  const { data, error } = await admin.from('memberships')
    .select('org_id, user_id, org:organizations!inner(name, status, ai_enabled), profile:profiles(full_name, email, timezone, language)')
    .eq('status', 'active').in('role', ['owner', 'director']).eq('org.ai_enabled', true);
  if (error) throw new Error(error.message);
  const facts = new Map<string, BriefFacts>();
  const texts = new Map<string, Awaited<ReturnType<typeof writeBrief>>>();
  let written = 0; let skipped = 0; let email = 0; let whatsapp = 0;
  for (const m of (data ?? []) as unknown as Row[]) {
    if (!m.org?.ai_enabled || m.org.status !== 'active' || !m.profile) continue;
    const tz = m.profile.timezone || 'UTC';
    if (formatInTimeZone(now, tz, 'i') !== '1' || formatInTimeZone(now, tz, 'H') !== '8') continue;
    const period = periodKey('weekly', tz, now);
    const { count } = await admin.from('ai_briefs').select('id', { count: 'exact', head: true }).eq('org_id', m.org_id).eq('user_id', m.user_id).eq('kind', 'weekly').eq('period_key', period);
    if (count) { skipped++; continue; }
    const lang: Language = isLanguage(m.profile.language) ? m.profile.language : 'en';
    const fk = `${m.org_id}|${tz}`;
    if (!facts.has(fk)) facts.set(fk, await gatherFacts(admin, { id: m.org_id, name: m.org.name }, 'weekly', tz, now));
    const tk = `${fk}|${lang}`;
    if (!texts.has(tk)) texts.set(tk, await writeBrief(facts.get(fk)!, lang, true));
    const b = texts.get(tk)!;
    const saved = await saveBrief(admin, { org_id: m.org_id, user_id: m.user_id, kind: 'weekly', period_key: period, language: lang, ...b }, { onlyIfNew: true });
    if (!saved) { skipped++; continue; }
    written++;
    const d = await deliverBrief(admin, m.org_id, m.org.name, { id: m.user_id, ...m.profile }, b.content);
    if (d.email) email++;
    if (d.whatsapp) whatsapp++;
  }
  return json({ written, skipped, email, whatsapp });
});
