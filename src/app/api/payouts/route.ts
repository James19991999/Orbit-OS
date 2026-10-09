import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, rateLimit, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { validateLines, MAX_LINES } from '@/lib/payouts/service';

export const dynamic = 'force-dynamic';

const Body = z.object({
  title: z.string().trim().min(2).max(120),
  lines: z.array(z.object({
    name: z.string().max(120), phone: z.string().max(24), amount_minor: z.number().int(),
    user_id: z.string().uuid().nullable().optional(), narrative: z.string().max(100).nullable().optional(),
  }).strict()).max(MAX_LINES),
}).strict();

/** Draft a payout batch (the "maker"). A different owner or director must approve it before money moves. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  await rateLimit('payout-create', ctx.user.id, 20, 3600);
  const b = await parseBody(req, Body);
  const { ok, errors } = validateLines(b.lines);
  if (errors.length) return json({ error: 'Some lines need fixing', lineErrors: errors }, 400);
  const admin = getAdminClient();
  // Only link user_ids that are members of this workspace.
  const ids = [...new Set(ok.map((l) => l.user_id).filter(Boolean))] as string[];
  const { data: members } = ids.length ? await admin.from('memberships').select('user_id').eq('org_id', ctx.org.id).in('user_id', ids) : { data: [] };
  const valid = new Set((members ?? []).map((m) => m.user_id as string));
  const total = ok.reduce((s, l) => s + l.amount_minor, 0);
  const { data: batch, error } = await admin.from('payout_batches').insert({ org_id: ctx.org.id, title: b.title, total_minor: total, line_count: ok.length, created_by: ctx.user.id }).select('id').single();
  if (error || !batch) throw new ApiError(500, error?.message ?? 'Could not create the batch');
  const { error: le } = await admin.from('payout_lines').insert(ok.map((l) => ({ batch_id: batch.id, org_id: ctx.org.id, user_id: l.user_id && valid.has(l.user_id) ? l.user_id : null, name: l.name, phone: l.phone, amount_minor: l.amount_minor, narrative: l.narrative })));
  if (le) { await admin.from('payout_batches').delete().eq('id', batch.id); throw new ApiError(500, le.message); }
  await audit(req, ctx.org.id, ctx.user.id, 'payout.drafted', { type: 'payout_batch', id: batch.id }, { lines: ok.length, total_minor: total });
  return json({ id: batch.id, lines: ok.length, total_minor: total });
});
