'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Dialog, Input, Banner, Icon, Segmented, InlineError, cn } from '@/components/ui';
import { PLANS, priceFor, seatsFor, SEAT_BLOCK, type PlanId, type BillingPeriod } from '@/lib/billing/plans';
import { type Currency } from '@/lib/format';
import { postJson, errorMessage } from '@/hooks/useAction';
import { useFormat } from '@/lib/locale/client';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n/shared';

const POLL_MS = 3000;
const POLL_LIMIT_MS = 90_000;
type Phase = { kind: 'idle' } | { kind: 'waiting'; ref: string; method: 'MPESA' | 'CARD'; startedAt: number } | { kind: 'slow'; ref: string } | { kind: 'done' } | { kind: 'failed'; reason: string };

/** Plan picker + IntaSend checkout. M-Pesa status polling is bounded to 90s, then falls back to the webhook. */
export function BillingPlans({ currentPlan, currency, activeMembers, canPay, configured }: { currentPlan: PlanId; currency: Currency; activeMembers: number; canPay: boolean; configured: boolean }) {
  const fmt = useFormat();
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [blocks, setBlocks] = useState(0);
  const [chosen, setChosen] = useState<PlanId | null>(null);
  // Workspaces outside Kenya default to card; M-Pesa stays available (charged in KES).
  const [method, setMethod] = useState<'MPESA' | 'CARD'>(currency === 'KES' ? 'MPESA' : 'CARD');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const poll = useCallback((ref: string, startedAt: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (Date.now() - startedAt > POLL_LIMIT_MS) { setPhase({ kind: 'slow', ref }); return; }
      try {
        const r = await fetch(`/api/billing/status?ref=${encodeURIComponent(ref)}`).then((x) => x.json());
        if (r.state === 'COMPLETE') { setPhase({ kind: 'done' }); router.refresh(); return; }
        if (r.state === 'FAILED') { setPhase({ kind: 'failed', reason: r.reason || t('bill.declined') }); return; }
      } catch { /* transient — keep polling until the limit */ }
      poll(ref, startedAt);
    }, POLL_MS);
  }, [router, t]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const ref = sp.get('ref');
    if (ref && ref.startsWith('orb_')) { const at = Date.now(); setPhase({ kind: 'waiting', ref, method: 'CARD', startedAt: at }); poll(ref, at); }
  }, [sp, poll]);

  async function pay() {
    if (!chosen) return;
    setErr(null); setBusy(true);
    try {
      const r = await postJson<{ ref: string; method: 'MPESA' | 'CARD'; url?: string }>('/api/billing/checkout', { plan: chosen, period, extraBlocks: chosen === 'enterprise' ? blocks : 0, method, phone: method === 'MPESA' ? phone : undefined });
      if (r.method === 'CARD' && r.url) { window.location.href = r.url; return; }
      const at = Date.now();
      setChosen(null);
      setPhase({ kind: 'waiting', ref: r.ref, method: 'MPESA', startedAt: at });
      poll(r.ref, at);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const mpesaCurrency: Currency = 'KES';
  const payCurrency = method === 'MPESA' ? mpesaCurrency : currency;

  return (
    <div className="flex flex-col gap-4">
      {phase.kind === 'waiting' && (
        <Banner tone="info" icon="hourglass_top">
          {phase.method === 'MPESA' ? t('bill.mpesa_wait') : t('bill.card_wait')}
          <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" aria-hidden />
          <button type="button" className="ml-3 underline" onClick={() => { clearTimeout(timer.current); setPhase({ kind: 'idle' }); }}>{t('bill.cancel')}</button>
        </Banner>
      )}
      {phase.kind === 'slow' && <Banner tone="warning">{t('bill.slow')} <button type="button" className="underline" onClick={() => { const at = Date.now(); setPhase({ kind: 'waiting', ref: phase.ref, method: 'MPESA', startedAt: at }); poll(phase.ref, at); }}>{t('bill.check')}</button></Banner>}
      {phase.kind === 'done' && <Banner tone="info" icon="check_circle">{t('bill.done')}</Banner>}
      {phase.kind === 'failed' && <Banner tone="alert">{t('bill.failed', { reason: phase.reason })} <button type="button" className="underline" onClick={() => setPhase({ kind: 'idle' })}>{t('bill.retry')}</button></Banner>}
      {!configured && <Banner tone="warning">{t('bill.not_configured')}</Banner>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label={t('bill.period')} value={period} onChange={setPeriod} options={[{ value: 'monthly', label: t('bill.monthly') }, { value: 'annual', label: t('bill.annual') }]} />
        <p className="text-body-sm text-on-surface-variant">{t('bill.active', { count: activeMembers })}</p>
      </div>
      <ul className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const fits = seatsFor(id, id === 'enterprise' ? 100 : 0) >= activeMembers;
          const current = id === currentPlan;
          return (
            <li key={id} className={cn('card flex flex-col p-5', current && 'border-primary-container shadow-glow')}>
              <div className="flex items-center justify-between"><h3 className="text-headline-sm">{p.name}</h3>{current && <span className="rounded-full bg-primary-container/15 px-2 py-0.5 text-label-xs text-primary">{t('bill.current')}</span>}</div>
              <p className="text-body-sm text-on-surface-variant">{t(`plan.${id}.tagline`)}</p>
              <p className="mt-4 text-headline-lg tnum">{fmt.money(priceFor(id, period, currency), currency, { decimals: false })}<span className="text-body-sm text-on-surface-variant">{period === 'annual' ? t('bill.per_year') : t('bill.per_month')}</span></p>
              {currency !== 'KES' && <p className="text-body-sm text-on-surface-variant">{t('bill.mpesa_price', { amount: fmt.money(priceFor(id, period, 'KES'), 'KES', { decimals: false }) })}</p>}
              <ul className="mt-4 flex-1 space-y-1.5 text-body-md">
                {p.features.map((f, i) => <li key={f} className="flex gap-2"><Icon name="check" className="text-[18px] text-healthy" />{t(`plan.${id}.f${i}` as MessageKey)}</li>)}
              </ul>
              {canPay && <Button className="mt-5" variant={current ? 'secondary' : 'primary'} disabled={!fits || !configured || phase.kind === 'waiting'} onClick={() => { setErr(null); setChosen(id); }}>
                {!fits ? t('bill.too_small') : current ? t('bill.renew') : t('bill.choose', { plan: p.name })}
              </Button>}
            </li>
          );
        })}
      </ul>

      <Dialog open={!!chosen} onClose={() => setChosen(null)} title={chosen ? `${PLANS[chosen].name} · ${t(`bill.p.${period}`)}` : ''}
        footer={<><Button variant="ghost" onClick={() => setChosen(null)}>{t('bill.cancel')}</Button><Button loading={busy} onClick={pay}>
          {chosen ? t('bill.pay_amount', { amount: fmt.money(priceFor(chosen, period, payCurrency, chosen === 'enterprise' ? blocks : 0), payCurrency) }) : t('bill.pay')}</Button></>}>
        {chosen && (
          <div className="grid gap-4">
            {chosen === 'enterprise' && (
              <Input label={t('bill.blocks', { n: SEAT_BLOCK.size })} type="number" min={0} max={100} value={String(blocks)} onChange={(e) => setBlocks(Math.max(0, Number(e.target.value) || 0))}
                hint={t('bill.seats_total', { n: seatsFor('enterprise', blocks) })} />
            )}
            <fieldset>
              <legend className="mb-2 text-label-sm text-on-surface-variant">{t('bill.pay_with')}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(['MPESA', 'CARD'] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
                    className={cn('flex h-14 items-center justify-center gap-2 rounded border text-label-md', method === m ? 'border-primary-container bg-primary-container/15' : 'border-outline-variant')}>
                    <Icon name={m === 'MPESA' ? 'phone_iphone' : 'credit_card'} />{m === 'MPESA' ? 'M-Pesa' : t('bill.card')}
                  </button>
                ))}
              </div>
            </fieldset>
            {method === 'MPESA'
              ? <Input label={t('bill.phone')} inputMode="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} hint={t('bill.phone_hint')} />
              : <p className="text-body-sm text-on-surface-variant">{t('bill.redirect')}</p>}
            <p className="text-body-sm text-on-surface-variant">{period === 'annual' ? t('bill.one_time_year') : t('bill.one_time_month')}</p>
            <InlineError message={err} />
          </div>
        )}
      </Dialog>
    </div>
  );
}
