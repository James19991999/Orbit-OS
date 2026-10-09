import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { planAllows } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

const Body = z.object({
  enforce_mfa_admins: z.boolean().optional(),
  session_timeout_hours: z.union([z.literal(1), z.literal(4), z.literal(8), z.literal(12), z.literal(24)]).optional(),
  sso_domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i).max(253).nullable().optional(),
  audit_retention_years: z.number().int().min(1).max(10).optional(),
  ai_enabled: z.boolean().optional(),
}).strict();

/** Owner-only security and data-sharing settings (incl. sending workspace data to Claude for briefs). These columns are not client-writable (see RLS column grants). */
export const PATCH = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'], writable: true });
  const body = await parseBody(req, Body);
  if (Object.keys(body).length === 0) throw new ApiError(400, 'Nothing to update');
  if (body.sso_domain && !planAllows(ctx.org.plan, 'sso')) throw new ApiError(402, 'Single sign-on needs the Pro or Enterprise plan');
  if (body.sso_domain && ctx.org.plan !== 'enterprise') throw new ApiError(402, 'SAML single sign-on is part of the Enterprise plan');
  if (body.enforce_mfa_admins && ctx.role === 'owner') {
    const { data: aal } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') throw new ApiError(409, 'Set up two-factor authentication on your own account first, so you are not locked out.');
  }
  const patch = { ...body, ...(body.sso_domain !== undefined ? { sso_domain: body.sso_domain ? body.sso_domain.toLowerCase() : null } : {}) };
  const { error } = await getAdminClient().from('organizations').update(patch).eq('id', ctx.org.id);
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'org.auth_settings_updated', { type: 'organization', id: ctx.org.id }, patch);
  return json({ ok: true });
});
