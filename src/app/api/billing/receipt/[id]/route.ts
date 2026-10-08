import { handler, requireApiContext, ApiError } from '@/lib/api';
import { buildPdf } from '@/lib/reports/pdf';
import { getFormat } from '@/lib/locale/server';
import { PLANS } from '@/lib/billing/plans';
import type { BillingPayment } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, route) => {
  const params = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'auditor'] });
  const { data } = await ctx.supabase.from('billing_payments').select('*').eq('id', params.id).eq('org_id', ctx.org.id).maybeSingle();
  if (!data) throw new ApiError(404, 'Payment not found');
  const p = data as BillingPayment;
  if (p.state !== 'COMPLETE') throw new ApiError(409, 'Receipts are available for completed payments only');
  const fmt = await getFormat();
  const pdf = await buildPdf({
    title: 'Payment receipt', subtitle: `OrbitOS · ${ctx.org.legal_name || ctx.org.name}`, footer: 'OrbitOS receipt',
    sections: [{ heading: 'Details', kv: [
      ['Receipt number', p.api_ref], ['Date', fmt.date(p.created_at)],
      ['Plan', `${PLANS[p.plan].name} (${p.period})`], ['Seats', String(p.seats)],
      ['Service period', p.period_start && p.period_end ? `${fmt.date(p.period_start)} to ${fmt.date(p.period_end)}` : '-'],
      ['Paid via', p.method === 'MPESA' ? 'M-Pesa (IntaSend)' : 'Card (IntaSend)'], ['Amount', fmt.money(p.amount_minor, p.currency)],
    ] }, { heading: 'Notes', lines: ['Thank you for your payment. Keep this receipt for your records.'] }],
  });
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="receipt-${p.api_ref}.pdf"` } });
});
