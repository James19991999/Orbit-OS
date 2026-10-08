import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Owner-only, MFA-gated: makes the workspace read-only and schedules deletion in 30 days. Reversible until then. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'] });
  const { confirm } = await parseBody(req, z.object({ confirm: z.string() }));
  if (confirm !== ctx.org.slug) throw new ApiError(400, `Type the workspace domain “${ctx.org.slug}” to confirm.`);
  const { data: aal } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') throw new ApiError(403, 'Verify with two-factor authentication first (Profile → Security).');
  const when = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error } = await getAdminClient().from('organizations').update({ status: 'offboarding', deletion_scheduled_at: when }).eq('id', ctx.org.id);
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'org.suspension_scheduled', { type: 'organization', id: ctx.org.id }, { deletion_scheduled_at: when });
  return json({ ok: true, deletion_scheduled_at: when });
});

export const DELETE = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'] });
  if (ctx.org.status !== 'offboarding') throw new ApiError(409, 'Workspace is not being offboarded');
  const { error } = await getAdminClient().from('organizations').update({ status: 'active', deletion_scheduled_at: null }).eq('id', ctx.org.id);
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'org.suspension_cancelled', { type: 'organization', id: ctx.org.id });
  return json({ ok: true });
});
