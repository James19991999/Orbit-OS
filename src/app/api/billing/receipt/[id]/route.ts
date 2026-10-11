import { handler, requireApiContext, ApiError } from '@/lib/api';
import { buildPdf } from '@/lib/reports/pdf';
import { getFormat } from '@/lib/locale/server';
import { PLANS } from '@/lib/billing/plans';
import type { BillingPayment } from '@/lib/types';
import { getAdminClient } from '@/lib/supabase/admin';
import { fiscalView, loadConfig, type EtimsDocument } from '@/lib/etims/service';
import { TAX_RATES, vatOf } from '@/lib/etims/compose';
import { qrModules } from '@/lib/etims/qr';
import type { PdfSection } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, route) => {
  const params = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'auditor'] });
  const { data } = await ctx.supabase.from('billing_payments').select('*').eq('id', params.id).eq('org_id', ctx.org.id).maybeSingle();
  if (!data) throw new ApiError(404, 'Payment not found');
  const p = data as BillingPayment;
  if (p.state !== 'COMPLETE') throw new ApiError(409, 'Receipts are available for completed payments only');
  const fmt = await getFormat();
  const admin = getAdminClient();
  const [{ data: doc }, platform] = await Promise.all([
    admin.from('etims_documents').select('*').eq('billing_payment_id', p.id).eq('kind', 'sale').maybeSingle(),
    loadConfig(admin, 'platform'),
  ]);
  const sale = doc as EtimsDocument | null;
  const fiscal = fiscalView(sale, platform);
  const sections: PdfSection[] = [{ heading: 'Details', kv: [
    ['Receipt number', p.api_ref], ['Date', fmt.date(p.created_at)],
    ['Customer', ctx.org.legal_name || ctx.org.name], ...(sale?.customer_pin ? [['Customer KRA PIN', sale.customer_pin] as [string, string]] : []),
    ['Plan', `${PLANS[p.plan].name} (${p.period === 'annual' ? 'annual' : 'monthly'})`], ['Seats', String(p.seats)],
    ['Service period', p.period_start && p.period_end ? `${fmt.date(p.period_start)} to ${fmt.date(p.period_end)}` : '-'],
    ['Paid via', p.method === 'MPESA' ? 'M-Pesa (IntaSend)' : 'Card (IntaSend)'],
    ...(sale ? [[`VAT (${TAX_RATES[sale.tax_type]}%, included)`, fmt.money(Math.round(vatOf(p.amount_minor / 100, sale.tax_type) * 100), p.currency)] as [string, string]] : []),
    ['Amount', fmt.money(p.amount_minor, p.currency)],
  ] }];
  if (fiscal && platform) {
    sections.push({ heading: 'KRA eTIMS', kv: [
      ['Seller KRA PIN', platform.tin], ['CU invoice number', `${platform.sdc_id ?? ''}/${fiscal.invoiceNo}`],
      ['Receipt number', `${fiscal.receiptNo ?? '-'} / ${fiscal.totalReceiptNo ?? '-'}`], ['Internal data', fiscal.internalData ?? '-'],
      ['Receipt signature', fiscal.signature ?? '-'], ['Date and time', fiscal.dateTime ?? '-'],
    ], qr: fiscal.verifyUrl ? { modules: qrModules(fiscal.verifyUrl), caption: 'Scan to check with KRA' } : undefined });
  } else if (sale?.status === 'queued') {
    sections.push({ heading: 'KRA eTIMS', lines: ['The fiscal receipt is waiting for KRA. Download this receipt again later to get the KRA details.'] });
  }
  sections.push({ heading: 'Notes', lines: ['Thank you for your payment. Keep this receipt for your records.'] });
  const pdf = await buildPdf({ title: fiscal ? 'Tax invoice and receipt' : 'Payment receipt', subtitle: `OrbitOS · ${ctx.org.legal_name || ctx.org.name}`, footer: 'OrbitOS receipt', sections });
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="receipt-${p.api_ref}.pdf"` } });
});
