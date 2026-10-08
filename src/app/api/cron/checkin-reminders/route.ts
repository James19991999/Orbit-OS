import { formatInTimeZone } from 'date-fns-tz';
import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendEmail, emailLayout, isEmailConfigured } from '@/lib/email';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hourly: emails members whose local time is 16:00 on a weekday and who haven't checked in today. */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  if (!isEmailConfigured()) return json({ skipped: 'email not configured' });
  const admin = getAdminClient();
  const now = new Date();
  const { data, error } = await admin.from('memberships').select('org_id, user_id, org:organizations(name, status), profile:profiles(full_name, email, timezone, checkin_reminders)').eq('status', 'active').in('role', ['owner', 'director', 'contributor']);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const m of (data ?? []) as unknown as { org_id: string; user_id: string; org: { name: string; status: string }; profile: { full_name: string; email: string | null; timezone: string; checkin_reminders: boolean } }[]) {
    const p = m.profile;
    if (!p?.email || !p.checkin_reminders || m.org?.status !== 'active') continue;
    const tz = p.timezone || 'UTC';
    if (formatInTimeZone(now, tz, 'H') !== '16') continue;
    const dow = Number(formatInTimeZone(now, tz, 'i')); // 1=Mon … 7=Sun
    if (dow > 5) continue;
    const localDate = formatInTimeZone(now, tz, 'yyyy-MM-dd');
    const { count } = await admin.from('check_ins').select('id', { count: 'exact', head: true }).eq('org_id', m.org_id).eq('user_id', m.user_id).eq('for_date', localDate);
    if (count) continue;
    const r = await sendEmail({ to: p.email, subject: `${m.org.name}: what did you ship today?`,
      html: emailLayout('Async roll call', `<p>Hi ${p.full_name.split(' ')[0]}, take 30 seconds to share what you shipped today so your teammates in other time zones stay in sync.</p>`, { label: 'Check in', url: `${appUrl()}/culture?tab=roll-call` }) });
    if (r.sent) sent++;
  }
  return json({ sent });
});
