import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  role: z.enum(['owner', 'director', 'contributor', 'auditor']).optional(),
  title: z.string().max(80).nullable().optional(),
  department: z.string().max(80).nullable().optional(),
  status: z.literal('removed').optional(),
}).strict();

/** Owner-only membership changes, with last-owner protection. */
export const PATCH = handler<{ params: Promise<{ userId: string }> }>(async (req, route) => {
  const params = await route.params;
  const ctx = await requireApiContext({ roles: ['owner'], writable: true });
  const body = await parseBody(req, Body);
  const admin = getAdminClient();
  const { data: target } = await admin.from('memberships').select('role, status').eq('org_id', ctx.org.id).eq('user_id', params.userId).maybeSingle();
  if (!target || target.status !== 'active') throw new ApiError(404, 'Member not found');
  const losingOwner = target.role === 'owner' && ((body.role && body.role !== 'owner') || body.status === 'removed');
  if (losingOwner) {
    const { count } = await admin.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).eq('role', 'owner').eq('status', 'active');
    if ((count ?? 0) <= 1) throw new ApiError(409, 'A workspace must keep at least one owner. Promote someone else first.');
  }
  const { error } = await admin.from('memberships').update(body).eq('org_id', ctx.org.id).eq('user_id', params.userId);
  if (error) throw new ApiError(500, error.message);
  if (body.status === 'removed') await audit(req, ctx.org.id, ctx.user.id, 'member.removed', { type: 'membership', id: params.userId });
  return json({ ok: true });
});
