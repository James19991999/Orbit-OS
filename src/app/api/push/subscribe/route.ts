import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { pushConfigured } from '@/lib/push';

export const dynamic = 'force-dynamic';

const Sub = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'https only'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
}).passthrough();

/** Registers this browser/phone for notifications (stored under the signed-in person only). */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext();
  if (!pushConfigured()) throw new ApiError(503, 'Phone notifications are not configured');
  await rateLimit('push-sub', ctx.user.id, 20, 3600);
  const s = await parseBody(req, Sub);
  // A device that was used by someone else before belongs to whoever turns it on now.
  await getAdminClient().from('push_subscriptions').delete().eq('endpoint', s.endpoint).neq('user_id', ctx.user.id);
  await ctx.supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
  const { error } = await ctx.supabase.from('push_subscriptions').insert({
    endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  });
  if (error) throw new ApiError(500, error.message);
  return json({ ok: true });
});

export const DELETE = handler(async (req) => {
  const ctx = await requireApiContext();
  const { endpoint } = await parseBody(req, z.object({ endpoint: z.string().max(1000) }));
  await ctx.supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return json({ ok: true });
});
