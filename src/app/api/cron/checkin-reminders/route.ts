import { formatInTimeZone } from 'date-fns-tz';
import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendEmail, emailLayout, isEmailConfigured } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { linkedUsers, sendCheckinReminder } from '@/lib/whatsapp/outbound';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Row = { org_id: string; user_id: string; org: { name: string; status: string }; profile: { full_name: string; email: string | null; timezone: string; checkin_reminders: boolean } };

/**
 * Hourly: at 16:00 local time on weekdays, reminds members who haven't checked in today.
 * WhatsApp first (when linked and enabled — they can reply right there), email otherwise.
 */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  const admin = getAdminClient();
  const now = new Date();
  const { data, error } = await admin.from('memberships').select('org_id, user_id, org:organizations(name, status), profile:profiles(full_name, email, timezone, checkin_reminders)').eq('status', 'active').in('role', ['owner', 'director', 'contributor']);
  if (error) throw new Error(error.message);
  const due: Row[] = [];
  for (const m of (data ?? []) as unknown as Row[]) {
    const p = m.profile;
    if (!p?.checkin_reminders || m.org?.status !== 'active') continue;
    const tz = p.timezone || 'UTC';
    if (formatInTimeZone(now, tz, 'H') !== '16') continue;
    if (Number(formatInTimeZone(now, tz, 'i')) > 5) continue; // 1=Mon … 7=Sun
    const { count } = await admin.from('check_ins').select('id', { count: 'exact', head: true }).eq('org_id', m.org_id).eq('user_id', m.user_id).eq('for_date', formatInTimeZone(now, tz, 'yyyy-MM-dd'));
    if (!count) due.push(m);
  }
  const wa = await linkedUsers(admin, [...new Set(due.map((m) => m.user_id))]);
  let whatsapp = 0; let email = 0;
  for (const m of due) {
    const person = wa.get(m.user_id);
    if (person?.checkins) {
      try { await sendCheckinReminder(admin, person, { id: m.org_id, name: m.org.name }); whatsapp++; continue; } catch (e) { console.error('[checkin-reminders] whatsapp failed, falling back to email', (e as Error).message); }
    }
    if (!isEmailConfigured() || !m.profile.email) continue;
    const r = await sendEmail({ to: m.profile.email, subject: `${m.org.name}: what did you ship today?`,
      html: emailLayout('Async roll call', `<p>Hi ${m.profile.full_name.split(' ')[0]}, take 30 seconds to share what you shipped today so your teammates in other time zones stay in sync.</p>`, { label: 'Check in', url: `${appUrl()}/culture?tab=roll-call` }) });
    if (r.sent) email++;
  }
  return json({ due: due.length, whatsapp, email });
});
