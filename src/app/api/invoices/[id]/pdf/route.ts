import { handler, requireApiContext, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildPdf, type PdfSection } from '@/lib/reports/pdf';
import { formatMoney } from '@/lib/format';
import { formatDate, localeForCurrency } from '@/lib/locale';
import { fiscalView, invoiceDocument, loadConfig } from '@/lib/etims/service';
import { TAX_RATES, vatOf } from '@/lib/etims/compose';
import { qrModules } from '@/lib/etims/qr';
import type { Invoice } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** The invoice as a PDF, with KRA eTIMS fiscal details and QR code once KRA has accepted it. */
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, route) => {
  const { id } = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'director', 'auditor'] });
  const { data } = await ctx.supabase.from('invoices').select('*').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!data) throw new ApiError(404, 'Invoice not found');
  const inv = data as Invoice;
  const loc = localeForCurrency(inv.currency);
  const money = (m: number) => formatMoney(m, inv.currency, { locale: loc });
  const admin = getAdminClient();
  const [sale, credit, cfg] = await Promise.all([invoiceDocument(admin, id, 'sale'), invoiceDocument(admin, id, 'credit_note'), loadConfig(admin, ctx.org.id)]);
  const fiscal = fiscalView(sale, cfg);
  const sections: PdfSection[] = [
    { heading: 'Bill to', kv: [['Client', inv.client_name], ['Email', inv.client_email], ...(inv.client_kra_pin ? [['KRA PIN', inv.client_kra_pin] as [string, string]] : [])] },
    { heading: 'Invoice', kv: [
      ['Invoice number', inv.number], ['Issued', formatDate(`${inv.issued_on}T12:00:00Z`, 'long', loc)], ['Due', formatDate(`${inv.due_on}T12:00:00Z`, 'long', loc)],
      ['Status', inv.status === 'void' ? 'Void' : inv.status === 'paid' ? 'Paid' : inv.status === 'sent' ? 'Awaiting payment' : 'Draft'],
    ] },
    { heading: 'Amount', kv: [
      ['Description', inv.description || '-'],
      ...(sale ? [[`VAT (${TAX_RATES[sale.tax_type]}%, included)`, money(Math.round(vatOf(inv.amount_minor / 100, sale.tax_type) * 100))] as [string, string]] : []),
      ['Total', money(inv.amount_minor)],
    ] },
  ];
  if (fiscal) {
    sections.push({ heading: 'KRA eTIMS', kv: [
      ['CU invoice number', `${cfg!.sdc_id ?? ''}/${fiscal.invoiceNo}`], ['Receipt number', `${fiscal.receiptNo ?? '-'} / ${fiscal.totalReceiptNo ?? '-'}`],
      ['Internal data', fiscal.internalData ?? '-'], ['Receipt signature', fiscal.signature ?? '-'], ['Date and time', fiscal.dateTime ?? '-'],
      ...(cfg!.mrc_no ? [['MRC number', cfg!.mrc_no] as [string, string]] : []),
    ], qr: fiscal.verifyUrl ? { modules: qrModules(fiscal.verifyUrl), caption: 'Scan to check with KRA' } : undefined });
    if (credit?.status === 'submitted') sections.push({ heading: 'Credit note', lines: [`This invoice was reversed by KRA credit note ${credit.invc_no} (signature ${credit.rcpt_sign ?? '-'}).`] });
  } else if (sale && sale.status === 'queued') {
    sections.push({ heading: 'KRA eTIMS', lines: ['Waiting to be accepted by KRA. Download the invoice again once it shows as sent.'] });
  }
  const pdf = await buildPdf({ title: `Invoice ${inv.number}`, subtitle: ctx.org.legal_name || ctx.org.name, sections, footer: `${ctx.org.legal_name || ctx.org.name} · ${inv.number}` });
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${inv.number}.pdf"`, 'cache-control': 'private, no-store' } });
});
