'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Button, Dialog, InlineError, Input, Pill, Select } from '@/components/ui';
import { useAction, postJson } from '@/hooks/useAction';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n/shared';

export interface EtimsView {
  environment: 'sandbox' | 'production'; tin: string; bhfId: string; deviceSerial: string; tradeName: string | null; branchName: string | null;
  taxType: string; itemClassCode: string | null; itemClassName: string | null; itemCode: string | null; itemName: string;
  status: 'not_connected' | 'needs_item' | 'active' | 'error'; lastError: string | null; initializedAt: string | null;
}

const TAX = ['B', 'E', 'C', 'A', 'D'] as const;

/** Settings → KRA eTIMS: connect the OSCU device, register the service, then watch what's been sent. */
export function EtimsSettings({ config, counts, encryptionConfigured, isOwner, canWrite }:
  { config: EtimsView | null; counts: { submitted: number; queued: number; rejected: number }; encryptionConfigured: boolean; isOwner: boolean; canWrite: boolean }) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(!config || config.status === 'not_connected');
  const [confirm, setConfirm] = useState(false);
  const status = config?.status ?? 'not_connected';
  const retry = useAction(async () => {
    const r = await postJson<{ sent: number; waiting: number }>('/api/etims/config');
    return r;
  });
  const disconnect = useAction(async () => postJson('/api/etims/config', undefined, 'DELETE'), { success: t('etims.disconnected_toast') });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-md text-on-surface-variant">{t('etims.intro')}</p>
      {!encryptionConfigured && <Banner tone="warning" icon="key">{t('etims.needs_key')}</Banner>}
      {config && config.status !== 'not_connected' && (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={status === 'active' ? 'healthy' : status === 'error' ? 'alert' : 'warning'}>{t(`etims.status.${status}` as MessageKey)}</Pill>
          <Pill tone={config.environment === 'production' ? 'info' : 'neutral'}>{t(`etims.env.${config.environment}` as MessageKey)}</Pill>
          {status === 'active' && <span className="text-body-sm text-on-surface-variant tnum">
            {t('etims.sent_n', { count: counts.submitted })} · {t('etims.waiting_n', { count: counts.queued })}{counts.rejected ? ` · ${t('etims.rejected_n', { count: counts.rejected })}` : ''}
          </span>}
        </div>
      )}
      {config?.lastError && status === 'error' && <Banner tone="alert">{config.lastError}</Banner>}

      {config && config.status !== 'not_connected' && !editing && (
        <dl className="grid gap-3 text-body-md sm:grid-cols-2">
          <Item label={t('etims.trade_name')} value={[config.tradeName, config.branchName].filter(Boolean).join(' · ') || '—'} />
          <Item label={t('etims.pin')} value={`${config.tin} · ${t('etims.branch')} ${config.bhfId}`} mono />
          <Item label={t('etims.device')} value={config.deviceSerial} mono />
          <Item label={t('etims.vat')} value={t(`etims.vat.${config.taxType}` as MessageKey)} />
          {config.itemCode && <Item label={t('etims.service')} value={`${config.itemName} (${config.itemCode})`} />}
          {config.itemClassCode && <Item label={t('etims.classification')} value={`${config.itemClassName ?? ''} · ${config.itemClassCode}`} />}
        </dl>
      )}

      {status === 'needs_item' && isOwner && !editing && <ItemPicker defaultName={config!.itemName} onDone={() => router.refresh()} />}

      {editing && (isOwner
        ? <ConnectForm config={config} disabled={!encryptionConfigured || !canWrite} onDone={() => { setEditing(false); router.refresh(); }} onCancel={config && config.status !== 'not_connected' ? () => setEditing(false) : undefined} />
        : <p className="text-body-sm text-on-surface-variant">{t('etims.owner_only')}</p>)}

      {config && config.status !== 'not_connected' && !editing && (
        <div className="flex flex-wrap gap-2">
          {status === 'active' && counts.queued > 0 && canWrite && (
            <Button size="sm" icon="send" loading={retry.pending} onClick={async () => { if (await retry.run()) router.refresh(); }}>{t('etims.retry')}</Button>
          )}
          {isOwner && canWrite && <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(true)}>{t('etims.change')}</Button>}
          {isOwner && canWrite && <Button size="sm" variant="ghost" icon="link_off" onClick={() => setConfirm(true)}>{t('etims.disconnect')}</Button>}
        </div>
      )}
      <p className="text-body-sm text-on-surface-variant">{t('etims.kes_only')}</p>
      <InlineError message={retry.error} />
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('etims.disconnect_title')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={disconnect.pending} onClick={async () => { if (await disconnect.run()) { setConfirm(false); setEditing(true); router.refresh(); } }}>{t('etims.disconnect')}</Button></>}>
        <p className="text-body-md">{t('etims.disconnect_body')}</p>
      </Dialog>
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-label-xs uppercase text-on-surface-variant">{label}</dt><dd className={mono ? 'font-mono text-body-sm' : undefined}>{value}</dd></div>;
}

function ConnectForm({ config, disabled, onDone, onCancel }: { config: EtimsView | null; disabled: boolean; onDone: () => void; onCancel?: () => void }) {
  const t = useT();
  const [f, setF] = useState({
    environment: config?.environment ?? 'sandbox', tin: config?.tin ?? '', bhfId: config?.bhfId ?? '00', deviceSerial: config?.deviceSerial ?? '',
    taxType: config?.taxType ?? 'B', itemName: config?.itemName ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(async () => postJson('/api/etims/config', { ...f, tin: f.tin.replace(/\s+/g, '').toUpperCase(), itemName: f.itemName.trim() || undefined }, 'PUT'), { success: t('etims.connected_toast') });
  return (
    <form className="grid gap-4 md:grid-cols-2" noValidate onSubmit={async (e) => {
      e.preventDefault();
      if (!/^[A-Z][0-9]{9}[A-Z]$/.test(f.tin.replace(/\s+/g, '').toUpperCase())) return setErr(t('etims.inv.bad_pin'));
      if (!f.deviceSerial.trim()) return setErr(t('etims.serial_hint'));
      setErr(null);
      if (await save.run()) onDone();
    }}>
      <div className="md:col-span-2"><Banner tone="info" icon="info">{t('etims.before')}</Banner></div>
      <Input label={t('etims.pin')} hint={t('etims.pin_hint')} value={f.tin} autoCapitalize="characters" onChange={(e) => setF({ ...f, tin: e.target.value })} disabled={disabled} />
      <Input label={t('etims.branch')} hint={t('etims.branch_hint')} value={f.bhfId} inputMode="numeric" maxLength={2} onChange={(e) => setF({ ...f, bhfId: e.target.value.replace(/\D/g, '') })} disabled={disabled} />
      <Input label={t('etims.serial')} hint={t('etims.serial_hint')} value={f.deviceSerial} onChange={(e) => setF({ ...f, deviceSerial: e.target.value })} disabled={disabled} />
      <Select label={t('etims.env')} value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value as 'sandbox' | 'production' })} disabled={disabled}
        options={[{ value: 'sandbox', label: t('etims.env.sandbox') }, { value: 'production', label: t('etims.env.production') }]} />
      <Select label={t('etims.vat')} hint={t('etims.vat_hint')} value={f.taxType} onChange={(e) => setF({ ...f, taxType: e.target.value })} disabled={disabled}
        options={TAX.map((x) => ({ value: x, label: t(`etims.vat.${x}` as MessageKey) }))} />
      <Input label={t('etims.item_name')} hint={t('etims.item_name_hint')} value={f.itemName} onChange={(e) => setF({ ...f, itemName: e.target.value })} disabled={disabled} />
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" icon="link" loading={save.pending} disabled={disabled}>{t('etims.connect')}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>}
      </div>
      <div className="md:col-span-2"><InlineError message={err ?? save.error} /></div>
    </form>
  );
}

function ItemPicker({ defaultName, onDone }: { defaultName: string; onDone: () => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ code: string; name: string }[] | null>(null);
  const [pick, setPick] = useState<{ code: string; name: string } | null>(null);
  const [itemName, setItemName] = useState(defaultName);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/etims/classes?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
        setResults(j.results); setLoadErr(null);
      } catch (e) { if ((e as Error).name !== 'AbortError') setLoadErr((e as Error).message); }
    }, 250);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q]);
  const save = useAction(async () => postJson('/api/etims/item', { code: pick!.code, name: pick!.name, itemName: itemName.trim() }), { success: t('etims.registered_toast') });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-outline-variant p-4">
      <h3 className="text-label-md">{t('etims.step_item')}</h3>
      <Input label={t('etims.search')} placeholder={t('etims.search_ph')} value={q} onChange={(e) => setQ(e.target.value)} />
      <fieldset>
        <legend className="sr-only">{t('etims.classification')}</legend>
        <div className="max-h-56 overflow-y-auto rounded border border-outline-variant">
          {results === null ? <p className="p-3 text-body-sm text-on-surface-variant">…</p>
            : results.length === 0 ? <p className="p-3 text-body-sm text-on-surface-variant">{t('etims.no_results')}</p>
            : results.map((r) => (
              <label key={r.code} className="flex cursor-pointer items-center gap-2 border-b border-outline-variant px-3 py-2 text-body-md last:border-b-0 hover:bg-on-surface/5">
                <input type="radio" name="etims-class" checked={pick?.code === r.code} onChange={() => setPick(r)} className="h-4 w-4 accent-[#2563eb]" />
                <span className="flex-1">{r.name}</span><span className="font-mono text-body-sm text-on-surface-variant">{r.code}</span>
              </label>
            ))}
        </div>
      </fieldset>
      <Input label={t('etims.item_name')} hint={t('etims.item_name_hint')} value={itemName} onChange={(e) => setItemName(e.target.value)} />
      <div><Button icon="task_alt" disabled={!pick || itemName.trim().length < 2} loading={save.pending} onClick={async () => { if (await save.run()) onDone(); }}>{t('etims.register')}</Button></div>
      <InlineError message={loadErr ?? save.error} />
    </div>
  );
}
