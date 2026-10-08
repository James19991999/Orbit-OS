'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Banner, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson } from '@/hooks/useAction';
import { useClipboard } from '@/hooks/useClipboard';
import type { Invoice } from '@/lib/types';

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<null | 'void' | 'paid'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const clip = useClipboard();
  const send = useAction(async () => postJson<{ paymentUrl: string | null; emailed: boolean; emailReason: string | null }>(`/api/invoices/${invoice.id}/send`));
  const markPaid = useAction(async () => postJson(`/api/invoices/${invoice.id}/mark-paid`), { success: 'Invoice marked paid and revenue recorded' });
  const voidIt = useAction(async () => unwrap(await requireBrowserClient().from('invoices').update({ status: 'void' }).eq('id', invoice.id).select('id')), { success: 'Invoice voided' });
  const open = invoice.status === 'draft' || invoice.status === 'sent';
  async function doSend() {
    const r = await send.run();
    if (!r) return;
    const parts = [r.paymentUrl ? 'Payment link ready' : 'Marked as sent (IntaSend not configured, so no payment link)',
      r.emailed ? 'emailed to the client' : r.emailReason === 'not_configured' ? 'email not configured — share the link yourself' : 'email failed — share the link yourself'];
    setNotice(parts.join(' · '));
    toast(parts[0]);
    router.refresh();
  }
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-outline-variant pt-4">
      {notice && <Banner tone="info">{notice}</Banner>}
      <div className="flex flex-wrap gap-2">
        {open && <Button icon="send" onClick={doSend} loading={send.pending}>{invoice.status === 'draft' ? 'Send invoice' : 'Resend'}</Button>}
        {invoice.payment_url && (
          <Button icon={clip.status === 'copied' ? 'check' : 'link'} variant="secondary" onClick={() => clip.copy(invoice.payment_url!)}>
            {clip.status === 'copied' ? 'Link copied' : clip.status === 'error' ? 'Copy failed' : 'Copy payment link'}
          </Button>
        )}
        {open && <Button icon="price_check" variant="secondary" onClick={() => setConfirm('paid')}>Mark paid manually</Button>}
        {open && <Button icon="block" variant="ghost" onClick={() => setConfirm('void')}>Void</Button>}
      </div>
      <span aria-live="polite" className="sr-only">{clip.status === 'copied' ? 'Payment link copied' : clip.status === 'error' ? 'Copy failed' : ''}</span>
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'void' ? 'Void this invoice?' : 'Mark as paid?'}
        description={confirm === 'void' ? 'The client will no longer be able to pay it.' : 'Use this for bank transfers or cash. Revenue is recorded in the ledger.'}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant={confirm === 'void' ? 'danger' : 'primary'} loading={markPaid.pending || voidIt.pending}
            onClick={async () => { const ok = confirm === 'void' ? await voidIt.run() : await markPaid.run(); if (ok) { setConfirm(null); router.refresh(); } }}>
            {confirm === 'void' ? 'Void invoice' : 'Mark paid'}
          </Button></>}>
        <p className="text-body-md">Invoice {invoice.number} · {invoice.client_name}</p>
      </Dialog>
    </div>
  );
}
