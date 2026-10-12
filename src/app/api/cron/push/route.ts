import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { pushConfigured, pushNotification } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Safety net for the webhook: pushes recent notifications that weren't pushed yet (last 70 minutes only). */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  if (!pushConfigured() || !hasServiceRole()) return json({ pushed: 0, skipped: 'not_configured' });
  const admin = getAdminClient();
  const { data: subs } = await admin.from('push_subscriptions').select('user_id').limit(5000);
  const users = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  if (users.length === 0) return json({ pushed: 0 });
  const { data } = await admin.from('notifications').select('id').is('pushed_at', null).in('user_id', users)
    .gt('created_at', new Date(Date.now() - 70 * 60_000).toISOString()).order('created_at').limit(300);
  let pushed = 0;
  for (const n of data ?? []) pushed += (await pushNotification(admin, n.id as string)).sent > 0 ? 1 : 0;
  return json({ pushed });
});
