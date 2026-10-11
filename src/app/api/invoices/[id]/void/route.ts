import { handler, json, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { queueInvoiceCredit } from '@/lib/etims/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Voids an unpaid invoice. If it was sent to KRA eTIMS, a credit note reverses it there (KRA has no "cancel"). */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, route) => {
  const { id } = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  const { data: inv } = await ctx.supabase.from('invoices').select('id, status').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!inv) throw new ApiError(404, 'Invoice not found');
  if (inv.status === 'paid') throw new ApiError(409, 'Paid invoices can’t be voided.');
  if (inv.status === 'void') return json({ ok: true, already: true });
  const admin = getAdminClient();
  const { error } = await admin.from('invoices').update({ status: 'void' }).eq('id', id).neq('status', 'paid');
  if (error) throw new ApiError(500, error.message);
  const credit = await queueInvoiceCredit(admin, id);
  await audit(req, ctx.org.id, ctx.user.id, 'invoice.voided', { type: 'invoice', id }, { creditNote: credit.queued ? credit.doc?.status ?? 'queued' : 'not_needed' });
  return json({ ok: true, creditNote: credit.queued ? { status: credit.doc?.status } : null });
});
