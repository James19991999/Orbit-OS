import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAppContext } from '@/lib/context';
import { can } from '@/lib/roles';
import { formatMoney } from '@/lib/format';
import { invoiceDisplayStatus } from '@/lib/metrics/invoices';
import { Card, Pill, Icon, Banner } from '@/components/ui';
import { InvoiceActions } from '@/components/operations/InvoiceActions';
import type { Invoice } from '@/lib/types';

export const metadata: Metadata = { title: 'Invoice' };

export default async function InvoicePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { supabase, org, role } = await requireAppContext();
  if (!can.seeFinance(role)) return <Banner tone="info">Invoices are visible to owners, directors and auditors.</Banner>;
  const { data } = await supabase.from('invoices').select('*').eq('id', params.id).eq('org_id', org.id).maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice;
  const st = invoiceDisplayStatus(inv);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/operations?tab=finance" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />Finance & Runway</Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-label-xs uppercase text-on-surface-variant">Invoice</p>
            <h1 className="text-headline-lg-mobile md:text-headline-lg">{inv.number}</h1>
          </div>
          <Pill tone={st === 'paid' ? 'healthy' : st === 'overdue' ? 'alert' : st === 'due_today' ? 'warning' : 'info'}>{st.replace('_', ' ')}</Pill>
        </div>
        <p className="mt-4 text-headline-xl leading-none tnum">{formatMoney(inv.amount_minor, inv.currency)}</p>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-body-md md:grid-cols-3">
          <div><dt className="text-label-xs uppercase text-on-surface-variant">Bill to</dt><dd>{inv.client_name}<br /><span className="text-on-surface-variant">{inv.client_email}</span></dd></div>
          <div><dt className="text-label-xs uppercase text-on-surface-variant">Issued</dt><dd className="tnum">{inv.issued_on}</dd></div>
          <div><dt className="text-label-xs uppercase text-on-surface-variant">Due</dt><dd className="tnum">{inv.due_on} (Net {inv.terms_days})</dd></div>
          {inv.paid_at && <div><dt className="text-label-xs uppercase text-on-surface-variant">Paid</dt><dd className="tnum">{new Date(inv.paid_at).toLocaleString('en-GB')}</dd></div>}
        </dl>
        {inv.description && <p className="mt-4 text-body-md text-on-surface-variant">{inv.description}</p>}
        {inv.payment_url && inv.status === 'sent' && (
          <p className="mt-4 text-body-sm text-on-surface-variant">Payment link (M-Pesa or card): <a href={inv.payment_url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline" data-testid="payment-link">{inv.payment_url}</a></p>
        )}
        {can.manage(role) && <InvoiceActions invoice={inv} />}
      </Card>
    </div>
  );
}
