import { handler, json, requireApiContext, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { requestExpenseApprovals } from '@/lib/whatsapp/outbound';

export const dynamic = 'force-dynamic';

/** After an expense is saved as pending, ask the other owners/directors to approve it on WhatsApp. */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, route) => {
  const { id } = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'director', 'contributor'], writable: true });
  await rateLimit('expense-notify', ctx.user.id, 20, 600);
  // RLS-scoped read: proves the expense is in a workspace this person belongs to.
  const { data: e } = await ctx.supabase.from('finance_entries').select('id, org_id, approval_status').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!e) throw new ApiError(404, 'Expense not found');
  if (e.approval_status !== 'pending') return json({ sent: 0, reason: 'not_pending' });
  return json(await requestExpenseApprovals(getAdminClient(), id));
});
