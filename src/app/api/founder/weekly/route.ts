import { handler, json, rateLimit, ApiError } from '@/lib/api';
import { getAuthContext } from '@/lib/context';
import { isFounderEmail } from '@/lib/founder/emails';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendFounderWeeklyNow } from '@/lib/growth';

export const dynamic = 'force-dynamic';

/** Founder Console: send this week's summary email now. Same rules as the console: founder email + two-factor session. */
export const POST = handler(async () => {
  const ctx = await getAuthContext();
  if (!ctx || !isFounderEmail(ctx.user.email) || ctx.aal.current !== 'aal2') throw new ApiError(404, 'Not found');
  await rateLimit('founder-weekly', ctx.user.id, 3, 3600);
  const admin = getAdminClient();
  const r = await sendFounderWeeklyNow(admin);
  if (!r.sent) throw new ApiError(503, r.to ? 'Email is not configured on this deployment.' : 'FOUNDER_EMAILS is empty.', undefined, true);
  await admin.from('platform_audit').insert({ actor_id: ctx.user.id, actor_email: ctx.user.email ?? null, action: 'founder.weekly_sent' });
  return json({ sent: true, to: r.to });
});
