'use client';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Select, Textarea, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, errorMessage } from '@/hooks/useAction';
import { LEAVE_KINDS, weekdaysBetween } from '@/lib/leave';
import type { MessageKey } from '@/i18n/shared';
import { useT } from '@/i18n/client';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** "Request time off": type, dates, optional private note. The working-day count matches what the database stores. */
export function RequestLeave({ orgId }: { orgId: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: 'annual', from: today(), to: today(), note: '' });
  const [err, setErr] = useState<string | null>(null);
  const days = weekdaysBetween(f.from, f.to);
  const send = useAction(async () => {
    unwrap(await requireBrowserClient().from('leave_requests')
      .insert({ org_id: orgId, kind: f.kind, starts_on: f.from, ends_on: f.to, note: f.note.trim() || null }).select('id'));
    return true;
  }, { success: t('lv.sent') });
  const submit = async () => {
    setErr(null);
    if (f.to < f.from) return setErr(t('lv.err_dates'));
    if (days === 0) return setErr(t('lv.err_none'));
    if ((await send.run()) !== undefined) { setOpen(false); setF({ kind: 'annual', from: today(), to: today(), note: '' }); router.refresh(); }
  };
  return (
    <>
      <Button icon="beach_access" onClick={() => setOpen(true)}>{t('lv.request')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('lv.request')} description={t('lv.private')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button loading={send.pending} onClick={() => void submit()}>{t('lv.submit')}</Button></>}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Select label={t('lv.kind')} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}
            options={LEAVE_KINDS.map((k) => ({ value: k, label: t(`lv.k.${k}` as MessageKey) }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('lv.from')} type="date" required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} />
            <Input label={t('lv.to')} type="date" required min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </div>
          <p className="text-body-md tnum" aria-live="polite">{t('lv.days', { count: days })}</p>
          <Textarea label={t('lv.note')} maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} />
          {err && <p role="alert" className="text-body-sm text-alert">{err}</p>}
        </form>
      </Dialog>
    </>
  );
}

export function CancelLeave({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const run = useAction(async () => unwrap(await requireBrowserClient().rpc('cancel_leave', { p_id: id })), { success: t('lv.cancelled_toast') });
  return <Button size="sm" variant="ghost" icon="event_busy" loading={run.pending} onClick={async () => { if ((await run.run()) !== undefined) router.refresh(); }}>{t('lv.cancel')}</Button>;
}

/** Approve or decline, with an optional message to the person. */
export function DecideLeave({ id, name, children }: { id: string; name: string; children?: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'yes' | 'no'>(null);
  const decide = async (approve: boolean) => {
    setBusy(approve ? 'yes' : 'no');
    try {
      unwrap(await requireBrowserClient().rpc('decide_leave', { p_id: id, p_approve: approve, p_note: note.trim() || null }));
      toast(t(approve ? 'lv.approved_toast' : 'lv.declined_toast'), 'success');
      router.refresh();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(null); }
  };
  return (
    <>
    {children && (
      <SwipeRow disabled={!!busy}
        right={{ label: t('lv.approve'), icon: 'check_circle', tone: 'healthy', run: () => void decide(true) }}
        left={{ label: t('lv.decline'), icon: 'cancel', tone: 'alert', run: () => void decide(false) }}>
        {children}
      </SwipeRow>
    )}
    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
      <Input label={t('lv.reply', { name })} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="flex-1" />
      <div className="flex gap-2">
        <Button size="sm" icon="check" loading={busy === 'yes'} disabled={!!busy} onClick={() => void decide(true)}>{t('lv.approve')}</Button>
        <Button size="sm" variant="secondary" icon="close" loading={busy === 'no'} disabled={!!busy} onClick={() => void decide(false)}>{t('lv.decline')}</Button>
      </div>
    </div>
    </>
  );
}

export function LeaveAllowance({ orgId, value }: { orgId: string; value: number }) {
  const t = useT();
  const router = useRouter();
  const [days, setDays] = useState(String(value));
  const save = useAction(async () => {
    const n = Math.round(Number(days));
    if (!Number.isFinite(n) || n < 0 || n > 60) throw new Error('0–60');
    unwrap(await requireBrowserClient().from('leave_settings').upsert({ org_id: orgId, annual_days: n, updated_at: new Date().toISOString() }).select('org_id'));
    return true;
  }, { success: t('lv.saved') });
  return (
    <form className="flex flex-col items-start gap-2" onSubmit={async (e) => { e.preventDefault(); if ((await save.run()) !== undefined) router.refresh(); }}>
      <Input label={t('lv.allowance')} hint={t('lv.allowance_hint')} type="number" min={0} max={60} value={days} onChange={(e) => setDays(e.target.value)} className="w-full max-w-xs" />
      <Button type="submit" variant="secondary" size="sm" loading={save.pending}>{t('lv.save')}</Button>
    </form>
  );
}
