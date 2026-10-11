import { handler, json, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { invoiceDocument, loadConfig, processScope, queueInvoiceSale } from '@/lib/etims/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Send (or re-send) a sent invoice to KRA eTIMS now. A rejected invoice is queued again after you fix it. */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, route) => {
  const { id } = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  await rateLimit('etims-invoice', ctx.user.id, 20, 60);
  const { data: inv } = await ctx.supabase.from('invoices').select('id, org_id, number, client_name, client_kra_pin, amount_minor, currency, status').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!inv) throw new ApiError(404, 'Invoice not found');
  if (inv.status === 'draft') throw new ApiError(409, 'Send the invoice first.');
  const admin = getAdminClient();
  const cfg = await loadConfig(admin, ctx.org.id);
  if (!cfg || cfg.status !== 'active') throw new ApiError(409, 'Connect KRA eTIMS in Settings first.');
  const existing = await invoiceDocument(admin, id, 'sale');
  if (inv.status === 'void' && (!existing || existing.status !== 'submitted')) throw new ApiError(409, 'This invoice is void.');
  let result;
  if (!existing || existing.status === 'rejected') result = await queueInvoiceSale(admin, inv);
  else { await processScope(admin, ctx.org.id, { ignoreSchedule: true }); result = { queued: true, doc: await invoiceDocument(admin, id, 'sale') }; }
  await audit(req, ctx.org.id, ctx.user.id, 'etims.invoice_sent', { type: 'invoice', id }, { status: result.queued ? result.doc?.status : result.reason });
  return json({ etims: result.queued ? { status: result.doc?.status, resultCd: result.doc?.result_cd, resultMsg: result.doc?.result_msg } : { status: 'not_sent', reason: result.reason } });
});
