import { randomBytes } from 'node:crypto';
import { handler, json, requireApiContext, audit, ApiError } from '@/lib/api';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Generates (or rotates) the per-workspace GitHub webhook secret. Shown once to the admin. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  const secret = randomBytes(24).toString('hex');
  const { error } = await ctx.supabase.from('integrations').upsert({ org_id: ctx.org.id, kind: 'github', enabled: true, config: { secret } }, { onConflict: 'org_id,kind' });
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'integration.updated', { type: 'integration', id: 'github' }, { rotated: true });
  return json({ ok: true, secret, payloadUrl: `${appUrl()}/api/webhooks/github/${ctx.org.id}` });
});

export const DELETE = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  const { error } = await ctx.supabase.from('integrations').delete().eq('org_id', ctx.org.id).eq('kind', 'github');
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'integration.updated', { type: 'integration', id: 'github' }, { connected: false });
  return json({ ok: true });
});
