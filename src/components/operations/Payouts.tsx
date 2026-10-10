'use client';
import { useMemo, useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Textarea, InlineError, Pill, EmptyState, Banner, Icon } from '@/components/ui';
import { postJson, errorMessage } from '@/hooks/useAction';
import { useFormat } from '@/lib/locale/client';
import { useToast } from '@/components/ui';
import { parsePayoutCsv } from '@/lib/payouts/lines';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n';

export interface PayoutLineView { id: string; name: string; phone: string; amount_minor: number; status: 'pending' | 'sent' | 'failed'; failure_reason: string | null }
export interface PayoutBatchView {
  id: string; title: string; status: string; total_minor: number; line_count: number; created_at: string;
  created_by: string; creator: string; approver: string | null; failure_reason: string | null; lines: PayoutLineView[];
}

const TONE: Record<string, 'neutral' | 'warning' | 'healthy' | 'alert' | 'info'> = {
  draft: 'warning', approved: 'info', processing: 'info', completed: 'healthy', partially_failed: 'alert', failed: 'alert', cancelled: 'neutral',
};
const maskPhone = (p: string) => `${p.slice(0, 6)}•••${p.slice(-3)}`;

interface Row { name: string; phone: string; amount: string }
const emptyRow = (): Row => ({ name: '', phone: '', amount: '' });

/** M-Pesa payroll payouts: one person drafts, a different owner/director approves with two-factor, IntaSend pays. */
export function Payouts({ batches, canManage, userId, aal, memberNames }:
  { batches: PayoutBatchView[]; canManage: boolean; userId: string; aal: string | null; memberNames: string[] }) {
  const fmt = useFormat();
  const t = useT();
  const label = (s: string) => (s in TONE ? t(`pay.status.${s}` as MessageKey) : s);
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
      toast(t('pay.drafted_toast'), 'success');
      setOpen(false); setRows([emptyRow()]); setCsv('');
      router.refresh();
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(null); }
  }

  async function act(b: PayoutBatchView, action: 'approve' | 'cancel' | 'refresh') {
    setBusy(`${action}:${b.id}`);
    try {
      const r = await postJson<{ status: string; reason?: string }>(`/api/payouts/${b.id}`, { action });
      toast(action === 'approve' ? (r.status === 'completed' ? t('pay.sent_all') : r.status === 'processing' ? t('pay.sent_processing') : r.reason ? t('pay.no_approve', { status: label(r.status).toLowerCase(), reason: r.reason }) : t('pay.result', { status: label(r.status).toLowerCase() }))
        : action === 'cancel' ? t('pay.cancelled_toast') : t('pay.status_toast', { status: label(r.status) }), r.status === 'failed' ? 'error' : 'success');
      router.refresh();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(null); setConfirm(null); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm text-on-surface-variant">{t('pay.intro')}</p>
        {canManage && <Button icon="add" onClick={() => setOpen(true)}>{t('pay.new')}</Button>}
      </div>

      {batches.length === 0 ? <EmptyState icon="payments" title={t('pay.empty_title')} body={t('pay.empty_body')} /> : (
        <ul className="divide-y divide-outline-variant">
          {batches.map((b) => {
            const mine = b.created_by === userId;
            return (
              <li key={b.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-label-md">{b.title} <Pill tone={TONE[b.status] ?? 'neutral'} className="ml-1">{label(b.status)}</Pill></p>
                    <p className="text-body-sm text-on-surface-variant tnum">{t('pay.summary', { total: fmt.money(b.total_minor, 'KES'), count: b.line_count, creator: b.creator })}{b.approver ? ` · ${t('pay.approved_by', { name: b.approver })}` : ''} · {fmt.date(b.created_at)}</p>
                    {b.failure_reason && <p className="text-body-sm text-alert">{b.failure_reason}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {b.status === 'draft' && canManage && !mine && (aal === 'aal2'
                      ? <Button size="sm" icon="send_money" onClick={() => setConfirm(b)} loading={busy === `approve:${b.id}`}>{t('pay.approve')}</Button>
                      : <Link href={`/mfa?next=${encodeURIComponent('/operations?tab=finance#payouts')}`} className="inline-flex h-9 items-center gap-1 rounded border border-outline-variant px-3 text-label-sm"><Icon name="lock" className="text-[16px]" />{t('pay.verify_2fa')}</Link>)}
                    {b.status === 'draft' && mine && <span className="self-center text-body-sm text-on-surface-variant">{t('pay.waiting')}</span>}
                    {b.status === 'draft' && canManage && <Button size="sm" variant="ghost" onClick={() => act(b, 'cancel')} loading={busy === `cancel:${b.id}`}>{t('pay.cancel')}</Button>}
                    {b.status === 'processing' && canManage && <Button size="sm" variant="secondary" icon="refresh" onClick={() => act(b, 'refresh')} loading={busy === `refresh:${b.id}`}>{t('pay.refresh')}</Button>}
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-body-sm text-primary">{t('pay.show', { count: b.line_count })}</summary>
                  <div className="relative mt-2 overflow-x-auto">
                    <table className="w-full text-left text-body-sm">
                      <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant"><th scope="col" className="py-1 pr-3">{t('pay.col.name')}</th><th scope="col" className="py-1 pr-3">{t('pay.col.mpesa')}</th><th scope="col" className="py-1 pr-3 text-right">{t('pay.col.amount')}</th><th scope="col" className="py-1">{t('pay.col.status')}</th></tr></thead>
                      <tbody>
                        {b.lines.map((l) => (
                          <tr key={l.id} className="border-b border-outline-variant last:border-0">
                            <td className="py-1 pr-3">{l.name}</td>
                            <td className="py-1 pr-3 tnum">{maskPhone(l.phone)}</td>
                            <td className="py-1 pr-3 text-right tnum">{fmt.money(l.amount_minor, 'KES')}</td>
                            <td className="py-1">{l.status === 'sent' ? <Pill tone="healthy">{t('pay.line.paid')}</Pill> : l.status === 'failed' ? <Pill tone="alert">{t('pay.line.failed')}{l.failure_reason ? `: ${l.failure_reason}` : ''}</Pill> : <Pill tone="neutral">{t('pay.line.pending')}</Pill>}</td>
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

      <Dialog open={open} onClose={() => setOpen(false)} title={t('pay.dialog_title')} description={t('pay.dialog_desc')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('pay.cancel')}</Button><Button type="submit" form="payout-form" loading={busy === 'create'}>{t('pay.save_draft')}</Button></>}>
        <form id="payout-form" onSubmit={create} className="grid gap-4" noValidate>
          <Input label={t('pay.batch_name')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2" role="tablist" aria-label={t('pay.how_add')}>
            <Button type="button" size="sm" variant={mode === 'rows' ? 'primary' : 'secondary'} role="tab" aria-selected={mode === 'rows'} onClick={() => setMode('rows')}>{t('pay.enter_people')}</Button>
            <Button type="button" size="sm" variant={mode === 'csv' ? 'primary' : 'secondary'} role="tab" aria-selected={mode === 'csv'} onClick={() => setMode('csv')}>{t('pay.paste_csv')}</Button>
          </div>
          {mode === 'rows' ? (
            <div className="grid gap-2">
              <datalist id="payout-members">{memberNames.map((n) => <option key={n} value={n} />)}</datalist>
              {rows.map((r, i) => (
                <fieldset key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1.2fr_1fr_auto] sm:items-end">
                  <legend className="sr-only">{t('pay.person_n', { n: i + 1 })}</legend>
                  <Input label={t('pay.name_n', { n: i + 1 })} list="payout-members" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input label={t('pay.phone_n', { n: i + 1 })} inputMode="tel" placeholder="0712 345 678" value={r.phone} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                  <Input label={t('pay.amount_n', { n: i + 1 })} inputMode="decimal" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="sm" icon="delete" aria-label={t('pay.remove_n', { n: i + 1 })} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [emptyRow()])} />
                </fieldset>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="secondary" size="sm" icon="person_add" onClick={() => setRows([...rows, emptyRow()])}>{t('pay.add_person')}</Button>
                <span className="text-label-md tnum">{t('pay.total', { total: fmt.money(total, 'KES') })}</span>
              </div>
            </div>
          ) : (
            <Textarea label={t('pay.csv_label')} rows={6} placeholder={'name,phone,amount\nAmina Otieno,0712345678,45000\nBrian Kip,0722000111,38500'} value={csv} onChange={(e) => setCsv(e.target.value)} />
          )}
          {lineErrors.length > 0 && (
            <Banner tone="alert" icon="error">
              <ul className="list-disc pl-4">{lineErrors.slice(0, 8).map((l, i) => <li key={i}>{l.row ? t('pay.row', { n: l.row }) : ''}{l.message}</li>)}</ul>
            </Banner>
          )}
          <InlineError message={err} />
        </form>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={t('pay.confirm_title')}
        description={confirm ? t('pay.confirm_desc', { total: fmt.money(confirm.total_minor, 'KES'), count: confirm.line_count }) : undefined}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>{t('pay.not_now')}</Button><Button icon="send_money" loading={!!confirm && busy === `approve:${confirm.id}`} onClick={() => confirm && act(confirm, 'approve')}>{t('pay.approve')}</Button></>}>
        <p className="text-body-md">{t('pay.confirm_balance')}</p>
      </Dialog>
    </div>
  );
}
