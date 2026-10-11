import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendEmail, emailLayout, escapeHtml } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { PLANS } from '@/lib/billing/plans';
import type { Organization } from '@/lib/types';
import { isWithinWorkingHours } from '@/lib/scheduling/time';
import { makeT, isLanguage } from '@/i18n';

export const dynamic = 'force-dynamic';

/**
 * Hourly: renewal reminders at T-7, T-3, T-0 (IntaSend payments don't auto-renew) + seat auto-scale alerts.
 * Each owner is reminded once per day; with Quiet hours on, the email waits until their working hours.
 */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  const admin = getAdminClient();
  const { data: orgs, error } = await admin.from('organizations').select('*').eq('status', 'active');
  if (error) throw new Error(error.message);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  let reminders = 0; let seatAlerts = 0;
  for (const org of (orgs ?? []) as Organization[]) {
    const owners = ((await admin.from('memberships').select('user_id, profile:profiles(email, full_name, timezone, work_start, work_end, language)').eq('org_id', org.id).eq('role', 'owner').eq('status', 'active')).data ?? []) as unknown as { user_id: string; profile: { email: string | null; full_name: string; timezone: string; work_start: string; work_end: string; language: string | null } }[];
    const exp = new Date(org.plan_expires_at); exp.setUTCHours(0, 0, 0, 0);
    const days = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
    if ([7, 3, 0].includes(days)) {
      const title = days === 0 ? `${PLANS[org.plan].name} plan ends today` : `${PLANS[org.plan].name} plan ends in ${days} days`;
      const since = new Date(Date.now() - 20 * 3_600_000).toISOString();
      for (const o of owners) {
        const { count: already } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', o.user_id).eq('org_id', org.id).eq('kind', 'renewal').gte('created_at', since);
        if (already) continue;
        const now = Date.now();
        const inHours = !o.profile || isWithinWorkingHours({ userId: o.user_id, timezone: o.profile.timezone || 'UTC', workStart: o.profile.work_start || '09:00', workEnd: o.profile.work_end || '17:00' }, now, now + 60_000);
        if (org.quiet_hours && !inHours) continue; // try again next hour
        // The notification row is also the once-a-day dedupe marker: if it can't be written, don't email
        // (otherwise the owner would be emailed every hour).
        const marked = await admin.from('notifications').insert({ org_id: org.id, user_id: o.user_id, kind: 'renewal', title, body: 'Renew with M-Pesa or card to keep the workspace writable.', link: '/settings/billing' });
        if (marked.error) { console.error('[renewals] notification insert failed', marked.error.message); continue; }
        if (o.profile?.email) {
          const t = makeT(isLanguage(o.profile.language) ? o.profile.language : 'en');
          const heading = days === 0 ? t('notif.k.renewal_today', { plan: PLANS[org.plan].name }) : t('notif.k.renewal_days', { plan: PLANS[org.plan].name, n: days });
          await sendEmail({ to: o.profile.email, subject: `${org.name}: ${heading}`, html: emailLayout(heading, `<p>${escapeHtml(t('email.renew.body'))}</p>`, { label: t('email.renew.cta'), url: `${appUrl()}/settings/billing` }, t('email.footer')) });
        }
        reminders++;
      }
    }
    if (org.seat_autoscale) {
      const { count } = await admin.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'active');
      if ((count ?? 0) >= Math.ceil(org.seat_limit * 0.95)) {
        const since = new Date(Date.now() - 86_400_000).toISOString();
        const { count: recent } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('kind', 'seats').gte('created_at', since);
        if (!recent) {
          const ins = await admin.from('notifications').insert(owners.map((o) => ({ org_id: org.id, user_id: o.user_id, kind: 'seats', title: `${count} of ${org.seat_limit} seats used`, body: 'Add a block of 10 seats before you run out.', link: '/settings/billing' })));
          if (ins.error) console.error('[renewals] seat alert failed', ins.error.message); else seatAlerts++;
        }
      }
    }
  }
  return json({ reminders, seatAlerts });
});
