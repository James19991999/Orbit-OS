import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, rateLimit, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { isIntaSendConfigured } from '@/lib/intasend/client';
import { approveAndSend, syncBatch } from '@/lib/payouts/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ action: z.enum(['approve', 'cancel', 'refresh']) }).strict();

/**
 * approve — the "checker": a different owner/director, in a two-factor session, releases the money.
 * cancel  — drop a draft. refresh — re-check status with IntaSend.
 */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, route) => {
  const { id } = await route.params;
  const { action } = await parseBody(req, Body);
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: action !== 'refresh' });
  // RLS-scoped read proves the batch belongs to this workspace.
  const { data: batch } = await ctx.supabase.from('payout_batches').select('id, status, created_by, total_minor, line_count').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!batch) throw new ApiError(404, 'Payout batch not found');
  const admin = getAdminClient();

  if (action === 'cancel') {
    const { data } = await admin.from('payout_batches').update({ status: 'cancelled' }).eq('id', id).eq('status', 'draft').select('id').maybeSingle();
    if (!data) throw new ApiError(409, 'Only a draft can be cancelled.');
    await audit(req, ctx.org.id, ctx.user.id, 'payout.cancelled', { type: 'payout_batch', id });
    return json({ status: 'cancelled' });
  }
  if (action === 'refresh') {
    await rateLimit('payout-refresh', ctx.user.id, 30, 600);
    return json(await syncBatch(admin, id));
  }

  await rateLimit('payout-approve', ctx.user.id, 10, 3600);
  if (!isIntaSendConfigured()) throw new ApiError(503, 'Payments are not configured yet (IntaSend keys missing).');
  if (batch.status !== 'draft') throw new ApiError(409, `This batch is ${batch.status}.`);
  if (batch.created_by === ctx.user.id) throw new ApiError(403, 'A second owner or director must approve a payout you created.');
  const { data: aal } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') throw new ApiError(403, 'Approving payouts needs a two-factor session. Verify with your authenticator first.');
  const r = await approveAndSend(admin, id, ctx.user.id);
  await audit(req, ctx.org.id, ctx.user.id, 'payout.approved', { type: 'payout_batch', id }, { result: r.status, reason: r.reason ?? null, total_minor: batch.total_minor, lines: batch.line_count });
  if (r.status === 'refused') throw new ApiError(409, r.reason ?? 'Could not approve');
  return json(r);
});
