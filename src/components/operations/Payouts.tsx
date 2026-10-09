'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Textarea, InlineError, Pill, EmptyState, Banner, Icon } from '@/components/ui';
import { postJson, errorMessage } from '@/hooks/useAction';
import { useFormat } from '@/lib/locale/client';
import { useToast } from '@/components/ui';
import { parsePayoutCsv } from '@/lib/payouts/lines';

export interface PayoutLineView { id: string; name: string; phone: string; amount_minor: number; status: 'pending' | 'sent' | 'failed'; failure_reason: string | null }
export interface PayoutBatchView {
  id: string; title: string; status: string; total_minor: number; line_count: number; created_at: string;
  created_by: string; creator: string; approver: string | null; failure_reason: string | null; lines: PayoutLineView[];
}

const TONE: Record<string, 'neutral' | 'warning' | 'healthy' | 'alert' | 'info'> = {
  draft: 'warning', approved: 'info', processing: 'info', completed: 'healthy', partially_failed: 'alert', failed: 'alert', cancelled: 'neutral',
};
const LABEL: Record<string, string> = {
  draft: 'Awaiting approval', approved: 'Approved', processing: 'Sending', completed: 'Paid', partially_failed: 'Some failed', failed: 'Failed', cancelled: 'Cancelled',
};
const maskPhone = (p: string) => `${p.slice(0, 6)}•••${p.slice(-3)}`;

interface Row { name: string; phone: string; amount: string }
const emptyRow = (): Row => ({ name: '', phone: '', amount: '' });

/** M-Pesa payroll payouts: one person drafts, a different owner/director approves with two-factor, IntaSend pays. */
export function Payouts({ batches, canManage, userId, aal, memberNames }:
  { batches: PayoutBatchView[]; canManage: boolean; userId: string; aal: string | null; memberNames: string[] }) {
  const fmt = useFormat();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`Salaries ${new Date().toISOString().slice(0, 7)}`);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [csv, setCsv] = useState('');
  const [mode, setMode] = useState<'rows' | 'csv'>('rows');
  const [err, setErr] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<{ row: number; message: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PayoutBatchView | null>(null);

  const parsedRows = useMemo(() => rows.filter((r) => r.name || r.phone || r.amount).map((r) => ({ name: r.name.trim(), phone: r.phone.trim(), amount_minor: fmt.parseMoney(r.amount) ?? -1 })), [rows, fmt]);
  const total = parsedRows.reduce((s, r) => s + Math.max(0, r.amount_minor), 0);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLineErrors([]);
    let lines = parsedRows;
    if (mode === 'csv') {
      const parsed = parsePayoutCsv(csv);
      if (parsed.errors.length) { setLineErrors(parsed.errors); return; }
      lines = parsed.lines;
    }
    setBusy('create');
    try {
      const res = await fetch('/api/payouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, lines }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? `Request failed (${res.status})`); setLineErrors(data.lineErrors ?? []); return; }
      toast('Payout drafted — a second owner or director must approve it', 'success');
      setOpen(false); setRows([emptyRow()]); setCsv('');
      router.refresh();
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(null); }
  }

  async function act(b: PayoutBatchView, action: 'approve' | 'cancel' | 'refresh') {
    setBusy(`${action}:${b.id}`);
    try {
      const r = await postJson<{ status: string; reason?: string }>(`/api/payouts/${b.id}`, { action });
      toast(action === 'approve' ? (r.status === 'completed' ? 'Payout sent — everyone was paid' : r.status === 'processing' ? 'Payout released — M-Pesa is processing it' : `Payout ${LABEL[r.status]?.toLowerCase() ?? r.status}${r.reason ? `: ${r.reason}` : ''}`)
        : action === 'cancel' ? 'Draft cancelled' : `Status: ${LABEL[r.status] ?? r.status}`, r.status === 'failed' ? 'error' : 'success');
      router.refresh();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(null); setConfirm(null); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm text-on-surface-variant">Pay salaries straight to M-Pesa. One person prepares the batch; a different owner or director approves it with two-factor before any money moves.</p>
        {canManage && <Button icon="add" onClick={() => setOpen(true)}>New M-Pesa payout</Button>}
      </div>

      {batches.length === 0 ? <EmptyState icon="payments" title="No payouts yet" body="Draft a batch of M-Pesa payments for your team." /> : (
        <ul className="divide-y divide-outline-variant">
          {batches.map((b) => {
            const mine = b.created_by === userId;
            return (
              <li key={b.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-label-md">{b.title} <Pill tone={TONE[b.status] ?? 'neutral'} className="ml-1">{LABEL[b.status] ?? b.status}</Pill></p>
                    <p className="text-body-sm text-on-surface-variant tnum">{fmt.money(b.total_minor, 'KES')} · {b.line_count} {b.line_count === 1 ? 'person' : 'people'} · drafted by {b.creator}{b.approver ? ` · approved by ${b.approver}` : ''} · {fmt.date(b.created_at)}</p>
                    {b.failure_reason && <p className="text-body-sm text-alert">{b.failure_reason}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {b.status === 'draft' && canManage && !mine && (aal === 'aal2'
                      ? <Button size="sm" icon="send_money" onClick={() => setConfirm(b)} loading={busy === `approve:${b.id}`}>Approve & send</Button>
                      : <Link href={`/mfa?next=${encodeURIComponent('/operations?tab=finance#payouts')}`} className="inline-flex h-9 items-center gap-1 rounded border border-outline-variant px-3 text-label-sm"><Icon name="lock" className="text-[16px]" />Verify with 2FA to approve</Link>)}
                    {b.status === 'draft' && mine && <span className="self-center text-body-sm text-on-surface-variant">Waiting for a second approver</span>}
                    {b.status === 'draft' && canManage && <Button size="sm" variant="ghost" onClick={() => act(b, 'cancel')} loading={busy === `cancel:${b.id}`}>Cancel</Button>}
                    {b.status === 'processing' && canManage && <Button size="sm" variant="secondary" icon="refresh" onClick={() => act(b, 'refresh')} loading={busy === `refresh:${b.id}`}>Refresh status</Button>}
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-body-sm text-primary">Show {b.line_count} payment{b.line_count === 1 ? '' : 's'}</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-body-sm">
                      <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant"><th scope="col" className="py-1 pr-3">Name</th><th scope="col" className="py-1 pr-3">M-Pesa</th><th scope="col" className="py-1 pr-3 text-right">Amount</th><th scope="col" className="py-1">Status</th></tr></thead>
                      <tbody>
                        {b.lines.map((l) => (
                          <tr key={l.id} className="border-b border-outline-variant last:border-0">
                            <td className="py-1 pr-3">{l.name}</td>
                            <td className="py-1 pr-3 tnum">{maskPhone(l.phone)}</td>
                            <td className="py-1 pr-3 text-right tnum">{fmt.money(l.amount_minor, 'KES')}</td>
                            <td className="py-1">{l.status === 'sent' ? <Pill tone="healthy">Paid</Pill> : l.status === 'failed' ? <Pill tone="alert">Failed{l.failure_reason ? `: ${l.failure_reason}` : ''}</Pill> : <Pill tone="neutral">Pending</Pill>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New M-Pesa payout" description="Amounts in KES. Each person gets an M-Pesa transfer once a second owner or director approves."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="payout-form" loading={busy === 'create'}>Save draft</Button></>}>
        <form id="payout-form" onSubmit={create} className="grid gap-4" noValidate>
          <Input label="Batch name" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2" role="tablist" aria-label="How to add people">
            <Button type="button" size="sm" variant={mode === 'rows' ? 'primary' : 'secondary'} role="tab" aria-selected={mode === 'rows'} onClick={() => setMode('rows')}>Enter people</Button>
            <Button type="button" size="sm" variant={mode === 'csv' ? 'primary' : 'secondary'} role="tab" aria-selected={mode === 'csv'} onClick={() => setMode('csv')}>Paste CSV</Button>
          </div>
          {mode === 'rows' ? (
            <div className="grid gap-2">
              <datalist id="payout-members">{memberNames.map((n) => <option key={n} value={n} />)}</datalist>
              {rows.map((r, i) => (
                <fieldset key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1.2fr_1fr_auto] sm:items-end">
                  <legend className="sr-only">Person {i + 1}</legend>
                  <Input label={`Name ${i + 1}`} list="payout-members" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input label={`M-Pesa number ${i + 1}`} inputMode="tel" placeholder="0712 345 678" value={r.phone} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                  <Input label={`Amount ${i + 1} (KES)`} inputMode="decimal" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="sm" icon="delete" aria-label={`Remove person ${i + 1}`} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [emptyRow()])} />
                </fieldset>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="secondary" size="sm" icon="person_add" onClick={() => setRows([...rows, emptyRow()])}>Add person</Button>
                <span className="text-label-md tnum">Total {fmt.money(total, 'KES')}</span>
              </div>
            </div>
          ) : (
            <Textarea label="CSV: name, phone, amount (KES)" rows={6} placeholder={'name,phone,amount\nAmina Otieno,0712345678,45000\nBrian Kip,0722000111,38500'} value={csv} onChange={(e) => setCsv(e.target.value)} />
          )}
          {lineErrors.length > 0 && (
            <Banner tone="alert" icon="error">
              <ul className="list-disc pl-4">{lineErrors.slice(0, 8).map((l, i) => <li key={i}>{l.row ? `Row ${l.row}: ` : ''}{l.message}</li>)}</ul>
            </Banner>
          )}
          <InlineError message={err} />
        </form>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title="Send this payout?"
        description={confirm ? `${fmt.money(confirm.total_minor, 'KES')} to ${confirm.line_count} ${confirm.line_count === 1 ? 'person' : 'people'} via M-Pesa. Money leaves your IntaSend wallet and can't be pulled back.` : undefined}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Not now</Button><Button icon="send_money" loading={!!confirm && busy === `approve:${confirm.id}`} onClick={() => confirm && act(confirm, 'approve')}>Approve & send</Button></>}>
        <p className="text-body-md">Make sure your IntaSend wallet has enough balance, including M-Pesa transfer fees.</p>
      </Dialog>
    </div>
  );
}
