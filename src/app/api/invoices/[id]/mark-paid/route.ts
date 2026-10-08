import { handler, json, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Manual "mark paid" for bank transfers/cash. Uses the same atomic RPC as the IntaSend webhook. */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, route) => {
  const params = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  const { data: inv } = await ctx.supabase.from('invoices').select('id, status').eq('id', params.id).eq('org_id', ctx.org.id).maybeSingle();
  if (!inv) throw new ApiError(404, 'Invoice not found');
  const { data, error } = await getAdminClient().rpc('apply_invoice_payment', { p_invoice: params.id, p_raw: { manual: true, by: ctx.user.id } });
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'invoice.marked_paid', { type: 'invoice', id: params.id }, { result: data });
  return json({ ok: true, result: data });
});
