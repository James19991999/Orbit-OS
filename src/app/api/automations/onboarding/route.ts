import { handler, json, requireApiContext, rateLimit } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { runOnboarding } from '@/lib/automations';

export const dynamic = 'force-dynamic';

/**
 * Called right after someone accepts an invite: creates their first-week checklist straight away.
 * Only ever acts on the caller's own membership; safe to call twice (the second call does nothing).
 */
export const POST = handler(async () => {
  const ctx = await requireApiContext({ roles: ['director', 'contributor'], writable: true });
  await rateLimit('onboarding', ctx.user.id, 5, 60);
  const admin = getAdminClient();
  const { data: m } = await admin.from('memberships').select('id, org_id, user_id').eq('org_id', ctx.org.id).eq('user_id', ctx.user.id).eq('status', 'active').single();
  const r = m ? await runOnboarding(admin, m) : { created: 0, reason: 'not_member' };
  return json(r);
});
