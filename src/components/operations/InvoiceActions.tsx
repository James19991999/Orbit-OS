'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Banner, useToast } from '@/components/ui';
import { useAction, postJson } from '@/hooks/useAction';
import { useClipboard } from '@/hooks/useClipboard';
import { useT } from '@/i18n/client';
import type { Invoice } from '@/lib/types';

export function InvoiceActions({ invoice, fiscalised }: { invoice: Invoice; fiscalised: boolean }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<null | 'void' | 'paid'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const clip = useClipboard();
  const send = useAction(async () => postJson<{ paymentUrl: string | null; emailed: boolean; emailReason: string | null; etims?: { status: string } }>(`/api/invoices/${invoice.id}/send`));
  const markPaid = useAction(async () => postJson(`/api/invoices/${invoice.id}/mark-paid`), { success: t('inv.marked_paid_toast') });
  const voidIt = useAction(async () => {
    const r = await postJson<{ creditNote: { status: string } | null }>(`/api/invoices/${invoice.id}/void`);
    toast(r.creditNote ? t('etims.inv.voided_credit_toast') : t('etims.inv.voided_toast'), 'success');
    return r;
  });
  const open = invoice.status === 'draft' || invoice.status === 'sent';
  async function doSend() {
    const r = await send.run();
    if (!r) return;
    const parts = [r.paymentUrl ? t('inv.link_ready') : t('inv.sent_no_link'),
      r.emailed ? t('inv.emailed') : r.emailReason === 'not_configured' ? t('inv.email_not_configured') : t('inv.email_failed')];
    if (r.etims?.status === 'submitted') parts.push(t('inv.kra_submitted'));
    else if (r.etims?.status === 'queued') parts.push(t('inv.kra_queued'));
    setNotice(parts.join(' · '));
    toast(parts[0]);
    router.refresh();
  }
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-outline-variant pt-4">
      {notice && <Banner tone="info">{notice}</Banner>}
      <div className="flex flex-wrap gap-2">
        {open && <Button icon="send" onClick={doSend} loading={send.pending}>{invoice.status === 'draft' ? t('inv.send') : t('inv.resend')}</Button>}
        {invoice.payment_url && open && (
          <Button icon={clip.status === 'copied' ? 'check' : 'link'} variant="secondary" onClick={() => clip.copy(invoice.payment_url!)}>
            {clip.status === 'copied' ? t('inv.link_copied') : clip.status === 'error' ? t('inv.copy_failed') : t('inv.copy_link')}
          </Button>
        )}
        {open && <Button icon="price_check" variant="secondary" onClick={() => setConfirm('paid')}>{t('inv.mark_paid_manual')}</Button>}
        {open && <Button icon="block" variant="ghost" onClick={() => setConfirm('void')}>{t('inv.void')}</Button>}
      </div>
      <span aria-live="polite" className="sr-only">{clip.status === 'copied' ? t('inv.copied_sr') : clip.status === 'error' ? t('inv.copy_failed') : ''}</span>
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'void' ? t('etims.inv.void_title') : t('inv.paid_title')}
        description={confirm === 'void' ? (fiscalised ? t('etims.inv.void_body_kra') : t('etims.inv.void_body')) : t('inv.paid_body')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          <Button variant={confirm === 'void' ? 'danger' : 'primary'} loading={markPaid.pending || voidIt.pending}
            onClick={async () => { const ok = confirm === 'void' ? await voidIt.run() : await markPaid.run(); if (ok) { setConfirm(null); router.refresh(); } }}>
            {confirm === 'void' ? t('inv.void_btn') : t('inv.mark_paid')}
          </Button></>}>
        <p className="text-body-md">{t('inv.summary', { number: invoice.number, client: invoice.client_name })}</p>
      </Dialog>
    </div>
  );
}

/** "Send to KRA now" on the invoice page, for invoices KRA hasn't accepted yet. */
export function EtimsSendNow({ invoiceId }: { invoiceId: string }) {
  const t = useT();
  const router = useRouter();
  const run = useAction(async () => postJson(`/api/invoices/${invoiceId}/etims`), { success: t('etims.inv.sent_toast') });
  return <Button size="sm" icon="send" loading={run.pending} onClick={async () => { if (await run.run()) router.refresh(); }}>{t('etims.inv.send_now')}</Button>;
}
