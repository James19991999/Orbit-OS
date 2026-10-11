import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { requireAppContext } from '@/lib/context';
import { can } from '@/lib/roles';
import { invoiceDisplayStatus } from '@/lib/metrics/invoices';
import { Card, Pill, Icon, Banner, LinkButton } from '@/components/ui';
import { InvoiceActions, EtimsSendNow } from '@/components/operations/InvoiceActions';
import type { Invoice } from '@/lib/types';
import type { MessageKey } from '@/i18n/shared';
import { getFormat } from '@/lib/locale/server';
import { getT } from '@/i18n/server';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { fiscalView, loadConfig, type EtimsDocument } from '@/lib/etims/service';
import { qrSvg } from '@/lib/etims/qr';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('meta.invoice') };
}

export default async function InvoicePage(props: { params: Promise<{ id: string }> }) {
  const [fmt, t] = await Promise.all([getFormat(), getT()]);
  const params = await props.params;
  const { supabase, org, role } = await requireAppContext();
  if (!can.seeFinance(role)) return <Banner tone="info">{t('p.inv.finance_only')}</Banner>;
  const [{ data }, { data: docs }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', params.id).eq('org_id', org.id).maybeSingle(),
    supabase.from('etims_documents').select('*').eq('invoice_id', params.id).order('created_at', { ascending: false }),
  ]);
  if (!data) notFound();
  const inv = data as Invoice;
  const st = invoiceDisplayStatus(inv);
  const all = (docs ?? []) as EtimsDocument[];
  const sale = all.find((d) => d.kind === 'sale') ?? null;
  const credit = all.find((d) => d.kind === 'credit_note') ?? null;
  const cfg = hasServiceRole() ? await loadConfig(getAdminClient(), org.id) : null;
  const fiscal = fiscalView(sale, cfg);
  const qr = fiscal?.verifyUrl ? await qrSvg(fiscal.verifyUrl) : null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/operations?tab=finance" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />{t('p.inv.back')}</Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-label-xs uppercase text-on-surface-variant">{t('p.inv.title')}</p>
            <h1 className="text-headline-lg-mobile md:text-headline-lg">{inv.number}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={st === 'paid' ? 'healthy' : st === 'overdue' ? 'alert' : st === 'due_today' ? 'warning' : 'info'}>{t(`inv.st.${st}` as MessageKey)}</Pill>
            <LinkButton href={`/api/invoices/${inv.id}/pdf`} variant="secondary" size="sm" icon="download">{t('etims.inv.pdf')}</LinkButton>
          </div>
        </div>
        <p className="mt-4 text-headline-xl leading-none tnum">{fmt.money(inv.amount_minor, inv.currency)}</p>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-body-md md:grid-cols-3">
          <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.inv.bill_to')}</dt><dd>{inv.client_name}<br /><span className="text-on-surface-variant">{inv.client_email}</span>
            {inv.client_kra_pin && <><br /><span className="font-mono text-body-sm text-on-surface-variant">{t('p.inv.kra_pin')} {inv.client_kra_pin}</span></>}</dd></div>
          <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.inv.issued')}</dt><dd className="tnum">{fmt.date(inv.issued_on)}</dd></div>
          <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.inv.due')}</dt><dd className="tnum">{fmt.date(inv.due_on)} ({t('p.inv.net', { days: inv.terms_days })})</dd></div>
          {inv.paid_at && <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.inv.paid_at')}</dt><dd className="tnum">{fmt.date(inv.paid_at, 'datetime')}</dd></div>}
        </dl>
        {inv.description && <p className="mt-4 text-body-md text-on-surface-variant">{inv.description}</p>}
        {inv.payment_url && inv.status === 'sent' && (
          <p className="mt-4 text-body-sm text-on-surface-variant">{t('p.inv.pay_link')} <a href={inv.payment_url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline" data-testid="payment-link">{inv.payment_url}</a></p>
        )}
        {can.manage(role) && <InvoiceActions invoice={inv} fiscalised={sale?.status === 'submitted' || (sale?.status === 'queued' && sale.invc_no !== null)} />}
      </Card>

      {inv.status !== 'draft' && (sale || cfg?.status === 'active' || inv.currency === 'KES') && (
        <Card aria-labelledby="etims-h" data-testid="etims-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="etims-h" className="flex items-center gap-2 text-headline-sm"><Icon name="receipt_long" className="text-secondary" />{t('etims.inv.title')}</h2>
            <Pill tone={sale?.status === 'submitted' ? 'healthy' : sale?.status === 'rejected' ? 'alert' : sale?.status === 'queued' ? 'warning' : 'neutral'}>
              {t(sale ? (`etims.inv.${sale.status}` as MessageKey) : 'etims.inv.not_sent')}
            </Pill>
          </div>
          {fiscal ? (
            <div className="mt-4 flex flex-col gap-4 sm:flex-row">
              <dl className="grid flex-1 gap-3 text-body-md sm:grid-cols-2">
                <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('etims.inv.cu')}</dt><dd className="font-mono" data-testid="etims-cu">{cfg?.sdc_id ?? ''}/{fiscal.invoiceNo}</dd></div>
                <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('etims.inv.receipt')}</dt><dd className="font-mono">{fiscal.receiptNo ?? '—'} / {fiscal.totalReceiptNo ?? '—'}</dd></div>
                <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('etims.inv.signature')}</dt><dd className="break-all font-mono text-body-sm">{fiscal.signature ?? '—'}</dd></div>
                <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('etims.inv.internal')}</dt><dd className="break-all font-mono text-body-sm">{fiscal.internalData ?? '—'}</dd></div>
              </dl>
              {qr && fiscal.verifyUrl && (
                <a href={fiscal.verifyUrl} target="_blank" rel="noopener noreferrer" className="flex w-32 flex-col items-center gap-1 self-start text-center text-body-sm text-primary hover:underline">
                  {/* SVG generated server-side by the qrcode library from KRA's check URL. */}
                  <span className="block w-32 rounded bg-white p-1" role="img" aria-label={t('etims.inv.scan')} dangerouslySetInnerHTML={{ __html: qr }} />
                  {t('etims.inv.check')}
                </a>
              )}
            </div>
          ) : sale?.status === 'queued' ? (
            <p className="mt-3 text-body-md text-on-surface-variant">{t('etims.inv.queued_body')}</p>
          ) : sale?.status === 'rejected' ? (
            <p className="mt-3 text-body-md text-alert">{t('etims.inv.rejected_body', { msg: `${sale.result_cd ?? ''} ${sale.result_msg ?? ''}`.trim() })}</p>
          ) : inv.currency !== 'KES' ? (
            <p className="mt-3 text-body-md text-on-surface-variant">{t('etims.inv.not_kes', { currency: inv.currency })}</p>
          ) : cfg?.status !== 'active' ? (
            <p className="mt-3 text-body-md text-on-surface-variant">{t('etims.inv.connect')}{role === 'owner' && <> <Link href="/settings#etims" className="text-primary underline">{t('nav.settings')}</Link></>}</p>
          ) : null}
          {credit && <p className="mt-3 text-body-md">{credit.status === 'submitted' ? t('etims.inv.credit', { no: credit.invc_no ?? '' }) : t('etims.inv.credit_waiting')}</p>}
          {can.manage(role) && cfg?.status === 'active' && inv.currency === 'KES' && (sale?.status === 'queued' || sale?.status === 'rejected' || (!sale && inv.status === 'sent')) && (
            <div className="mt-4"><EtimsSendNow invoiceId={inv.id} /></div>
          )}
        </Card>
      )}
    </div>
  );
}
