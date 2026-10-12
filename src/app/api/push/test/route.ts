import { handler, json, requireApiContext, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { pushConfigured, sendPushToUser } from '@/lib/push';
import { getT } from '@/i18n/server';

export const dynamic = 'force-dynamic';

/** "Send a test" from Profile: one notification to all of my devices. */
export const POST = handler(async () => {
  const ctx = await requireApiContext();
  if (!pushConfigured()) throw new ApiError(503, 'Phone notifications are not configured');
  await rateLimit('push-test', ctx.user.id, 5, 600);
  const t = await getT();
  const r = await sendPushToUser(getAdminClient(), ctx.user.id, { title: t('push.test_title'), body: t('push.test_body'), url: '/profile', tag: 'test' });
  return json(r);
});
