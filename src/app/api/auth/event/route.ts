import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, clientIp, ApiError } from '@/lib/api';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.discriminatedUnion('type', [
  z.object({ type: z.literal('login') }),
  z.object({ type: z.literal('login_failed'), email: z.string().email().max(254), slug: z.string().max(40).optional() }),
]);

/** Records sign-in events in the workspace audit log (feeds Compliance → Security log). */
export const POST = handler(async (req) => {
  await rateLimit('auth-event', clientIp(req), 20, 60);
  const body = await parseBody(req, Body);
  if (body.type === 'login') {
    const ctx = await requireApiContext();
    await audit(req, ctx.org.id, ctx.user.id, 'auth.login', { type: 'user', id: ctx.user.id }, { method: 'password_or_passkey' });
    return json({ ok: true });
  }
  if (!hasServiceRole()) return json({ ok: true });
  const admin = getAdminClient();
  const { data: profile } = await admin.from('profiles').select('id').ilike('email', body.email).maybeSingle();
  if (!profile) return json({ ok: true }); // never reveal whether an account exists
  let q = admin.from('memberships').select('org_id, org:organizations!inner(slug)').eq('user_id', profile.id).eq('status', 'active');
  if (body.slug) q = q.eq('organizations.slug', body.slug);
  const { data: ms, error } = await q;
  if (error) throw new ApiError(500, error.message);
  for (const m of (ms ?? []).slice(0, 5)) {
    await audit(req, m.org_id as string, null, 'auth.login_failed', { type: 'user', id: profile.id }, { email: body.email });
  }
  return json({ ok: true });
});
